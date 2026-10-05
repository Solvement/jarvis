import { describe, it, expect, beforeEach } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { user } from "@/db/schema";
import {
  library,
  saveSnapshot,
  refresh,
  importReadings,
  setReadingVisibility,
  getItemStates,
  setItemState,
  defaultVisibility,
} from "@/lib/store";
import type { Board, Entry, Period, Reading, Source } from "@/lib/types";

const entry = (id: string, sourceHash = "h-" + id): Entry => ({
  id,
  kind: id.startsWith("paper:") ? "paper" : "project",
  title: id,
  summary: "s",
  url: "https://example.com/" + id,
  rank: 1,
  sourceHash,
});

const board = (source: Source, period: Period, items: Entry[], fetchedAt = "2026-10-04T10:00:00.000Z"): Board => ({
  id: `${source}:${period}`,
  source,
  period,
  sourceDate: "2026-10-04",
  fetchedAt,
  url: "https://example.com",
  items,
  contentHash: "c",
});

const translation = (itemId: string, sourceHash = "h-" + itemId, generatedAt = "2026-10-04T11:00:00-04:00"): Reading => ({
  itemId,
  sourceHash,
  level: "translation",
  title: "标题",
  summary: "摘要",
  generatedAt,
  author: "test",
  coverage: "listing",
  sections: [],
  sources: [],
  limitations: [],
});

const PUBLIC = { isOwner: false };
const OWNER = { isOwner: true };

let db: Db;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe("榜单快照", () => {
  it("空库返回空资料库", async () => {
    expect(await library(db, PUBLIC)).toEqual({ boards: [], readings: [] });
  });

  it("同一榜单取最新一次快照", async () => {
    await saveSnapshot(db, board("github", "daily", [entry("repo:a/old")], "2026-10-03T10:00:00.000Z"));
    await saveSnapshot(db, board("github", "daily", [entry("repo:a/new")], "2026-10-04T10:00:00.000Z"));
    const lib = await library(db, PUBLIC);
    expect(lib.boards).toHaveLength(1);
    expect(lib.boards[0].items[0].id).toBe("repo:a/new");
  });
});

describe("刷新", () => {
  const T0 = Date.parse("2026-10-04T12:00:00Z");
  const ok = async (source: Source, period: Period) => board(source, period, [entry(`repo:${source}/${period}`)]);

  it("六榜成功时全部保存", async () => {
    const lib = await refresh(db, ok, T0);
    expect(lib.boards).toHaveLength(6);
    expect(lib.readings).toEqual([]);
    expect(lib.notice).toBeUndefined();
  });

  it("两分钟内重复刷新被锁拦下，不再抓取", async () => {
    await refresh(db, ok, T0);
    let called = 0;
    const lib = await refresh(db, async (s, p) => (called++, ok(s, p)), T0 + 60_000);
    expect(called).toBe(0);
    expect(lib.notice).toMatch(/2 分钟/);
  });

  it("作者刷新后仍能看到草稿", async () => {
    await refresh(db, ok, T0);
    await importReadings(db, [translation("repo:github/daily")], { visibility: "draft" });
    const lib = await refresh(db, ok, T0 + 200_000, OWNER);
    expect(lib.readings).toHaveLength(1);
  });

  it("单榜失败保留上次成功内容并标记 stale", async () => {
    await refresh(db, ok, T0);
    const failing = async (s: Source, p: Period) => {
      if (s === "hf" && p === "weekly") throw new Error("HF 返回 HTTP 503");
      return ok(s, p);
    };
    const lib = await refresh(db, failing, T0 + 200_000);
    const hfWeekly = lib.boards.find((b) => b.id === "hf:weekly")!;
    expect(hfWeekly.stale).toBe(true);
    expect(hfWeekly.error).toBe("HF 返回 HTTP 503");
    expect(hfWeekly.items[0].id).toBe("repo:hf/weekly");
    expect(lib.notice).toMatch(/1 个榜单/);
  });
});

describe("作者导入", () => {
  beforeEach(async () => {
    await saveSnapshot(db, board("github", "monthly", [entry("repo:a/b")]));
  });

  it("拒绝不存在的条目", async () => {
    await expect(importReadings(db, [translation("repo:x/y")])).rejects.toThrow(/条目不存在/);
  });

  it("拒绝来源已变化的结果", async () => {
    await expect(importReadings(db, [translation("repo:a/b", "stale-hash")])).rejects.toThrow(/来源已改变/);
  });

  it("拒绝空数组和超量批次", async () => {
    await expect(importReadings(db, [])).rejects.toThrow(/1–300/);
  });

  it("导入后公开可见，并附带原条目", async () => {
    expect(await importReadings(db, [translation("repo:a/b")])).toEqual({ ok: true, count: 1 });
    const lib = await library(db, PUBLIC);
    expect(lib.readings).toHaveLength(1);
    expect(lib.readings[0].entry?.id).toBe("repo:a/b");
  });

  it("同一结果重复导入是幂等的", async () => {
    await importReadings(db, [translation("repo:a/b")]);
    await importReadings(db, [translation("repo:a/b")]);
    expect((await library(db, PUBLIC)).readings).toHaveLength(1);
  });

  it("条目离榜后仍可导入修订版（用已存版本里的条目核对来源）", async () => {
    await importReadings(db, [translation("repo:a/b")]);
    await saveSnapshot(db, board("github", "monthly", [entry("repo:z/z")], "2026-10-05T10:00:00.000Z"));
    const revised = translation("repo:a/b", "h-repo:a/b", "2026-10-07T09:00:00-04:00");
    expect(await importReadings(db, [revised])).toEqual({ ok: true, count: 1 });
    await expect(importReadings(db, [translation("repo:a/b", "changed", "2026-10-08T09:00:00-04:00")])).rejects.toThrow(/来源已改变/);
  });

  it("榜单数据（星数）变化后重复导入同一结果仍是幂等的", async () => {
    await importReadings(db, [translation("repo:a/b")]);
    await saveSnapshot(db, board("github", "monthly", [{ ...entry("repo:a/b"), stars: 999 }], "2026-10-05T10:00:00.000Z"));
    await importReadings(db, [translation("repo:a/b")]);
    expect((await library(db, PUBLIC)).readings).toHaveLength(1);
  });

  it("一批中任何一条无效则整批不写入", async () => {
    await expect(importReadings(db, [translation("repo:a/b"), translation("repo:x/y")])).rejects.toThrow();
    expect((await library(db, OWNER)).readings).toHaveLength(0);
  });

  it("章节图示：字段齐全才能导入，超大或高度越界被拒绝", async () => {
    const withFigure = (figure: Record<string, unknown>): Reading => ({
      ...translation("repo:a/b"),
      level: "brief",
      sections: [{ heading: "h", body: "b", citations: ["s1"], figure } as Reading["sections"][number]],
      sources: [{ id: "s1", title: "t", url: "https://github.com/a/b" }],
      limitations: ["l"],
    });
    expect(await importReadings(db, [withFigure({ title: "流程", caption: "怎么看", html: "<svg></svg>", height: 300 })])).toEqual({ ok: true, count: 1 });
    await expect(importReadings(db, [withFigure({ title: "", caption: "c", html: "<svg/>", height: 300 })])).rejects.toThrow(/图示/);
    await expect(importReadings(db, [withFigure({ title: "t", caption: "c", html: "x".repeat(300_001), height: 300 })])).rejects.toThrow(/图示/);
    await expect(importReadings(db, [withFigure({ title: "t", caption: "c", html: "<svg/>", height: 5000 })])).rejects.toThrow(/图示/);
  });

  it("精读缺少结构化研读记录被拒绝", async () => {
    const deep: Reading = {
      ...translation("repo:a/b"),
      level: "deep",
      coverage: "source_code",
      sections: [{ heading: "h", body: "b", citations: ["s1"] }],
      sources: [{ id: "s1", title: "t", url: "https://github.com/a/b" }],
      limitations: ["l"],
    };
    await expect(importReadings(db, [deep])).rejects.toThrow(/精读/);
  });
});

describe("草稿可见性", () => {
  beforeEach(async () => {
    await saveSnapshot(db, board("github", "monthly", [entry("repo:a/b")]));
    await importReadings(db, [translation("repo:a/b")], { visibility: "draft" });
  });

  it("草稿对访客不可见，对作者可见", async () => {
    expect((await library(db, PUBLIC)).readings).toHaveLength(0);
    const own = await library(db, OWNER);
    expect(own.readings).toHaveLength(1);
    expect(own.readings[0].visibility).toBe("draft");
  });

  it("未指定可见性时：精读默认草稿，翻译默认公开", async () => {
    await saveSnapshot(db, board("github", "weekly", [entry("repo:c/d")]));
    await importReadings(db, [translation("repo:c/d")]);
    const pub = await library(db, PUBLIC);
    expect(pub.readings.map((r) => r.itemId)).toEqual(["repo:c/d"]);
    expect(defaultVisibility({ ...translation("repo:c/d"), level: "deep" })).toBe("draft");
    expect(defaultVisibility(translation("repo:c/d"))).toBe("public");
  });

  it("改可见性只作用于指定层级，不波及同时间戳的其他版本", async () => {
    const brief = { ...translation("repo:a/b"), level: "brief" as const, sections: [{ heading: "h", body: "b", citations: ["s1"] }], sources: [{ id: "s1", title: "t", url: "https://github.com/a/b" }], limitations: ["l"] };
    await importReadings(db, [brief], { visibility: "public" });
    await setReadingVisibility(db, "repo:a/b", "2026-10-04T11:00:00-04:00", "translation", "public");
    const pub = await library(db, PUBLIC);
    expect(pub.readings.map((r) => r.level).sort()).toEqual(["brief", "translation"]);
    await setReadingVisibility(db, "repo:a/b", "2026-10-04T11:00:00-04:00", "translation", "draft");
    expect((await library(db, PUBLIC)).readings.map((r) => r.level)).toEqual(["brief"]);
  });

  it("发布后访客可见", async () => {
    const changed = await setReadingVisibility(db, "repo:a/b", "2026-10-04T11:00:00-04:00", "translation", "public");
    expect(changed).toBe(1);
    expect((await library(db, PUBLIC)).readings).toHaveLength(1);
  });
});

describe("个人阅读状态", () => {
  beforeEach(async () => {
    const now = new Date();
    await db.insert(user).values([
      { id: "u1", name: "A", email: "a@example.com", createdAt: now, updatedAt: now },
      { id: "u2", name: "B", email: "b@example.com", createdAt: now, updatedAt: now },
    ]);
  });

  it("显式标记已读与收藏，只对本人可见", async () => {
    await setItemState(db, "u1", "repo:a/b", { read: true, starred: true });
    const mine = await getItemStates(db, "u1");
    expect(mine["repo:a/b"].starred).toBe(true);
    expect(mine["repo:a/b"].readAt).toBeTruthy();
    expect(await getItemStates(db, "u2")).toEqual({});
  });

  it("部分更新不覆盖其他字段，取消已读清空时间", async () => {
    await setItemState(db, "u1", "repo:a/b", { read: true, note: "看 retrieval 部分" });
    await setItemState(db, "u1", "repo:a/b", { read: false });
    const s = (await getItemStates(db, "u1"))["repo:a/b"];
    expect(s.readAt).toBeNull();
    expect(s.note).toBe("看 retrieval 部分");
  });

  it("笔记长度有上限", async () => {
    await expect(setItemState(db, "u1", "repo:a/b", { note: "x".repeat(20001) })).rejects.toThrow(/笔记/);
  });
});
