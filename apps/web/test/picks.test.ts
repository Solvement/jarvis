import { describe, it, expect, beforeEach } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { saveSnapshot } from "@/lib/store";
import { latestEdition, savePicks, setPickStatus, type PickInput } from "@/lib/picks";
import type { Board, Entry } from "@/lib/types";

const entry = (id: string): Entry => ({ id, kind: "project", title: id, summary: "s", url: "https://github.com/" + id.slice(5), rank: 1, sourceHash: "h-" + id });
const board = (items: Entry[]): Board => ({
  id: "github:monthly", source: "github", period: "monthly", sourceDate: "2026-10-04",
  fetchedAt: "2026-10-04T10:00:00.000Z", url: "https://github.com/trending?since=monthly", items, contentHash: "c",
});
const pick = (itemId: string, rank: number, over: Partial<PickInput> = {}): PickInput => ({
  itemId, rank, kind: "core", plan: "deep", board: "github:monthly",
  headline: "标题", highlight: "最值得读的部分", why: "为什么值得读", coverage: "readme+tree", ...over,
});

let db: Db;
beforeEach(async () => {
  db = await createPgliteDb();
  await saveSnapshot(db, board([entry("repo:a/one"), entry("repo:b/two"), entry("repo:c/three")]));
});

describe("看点卡", () => {
  it("空库没有期号", async () => {
    expect(await latestEdition(db)).toBeNull();
  });

  it("按 rank 排序返回最新一期，并附带条目", async () => {
    await savePicks(db, "2026-10-04", [pick("repo:b/two", 2), pick("repo:a/one", 1)]);
    const ed = (await latestEdition(db))!;
    expect(ed.edition).toBe("2026-10-04");
    expect(ed.picks.map((p) => p.itemId)).toEqual(["repo:a/one", "repo:b/two"]);
    expect(ed.picks[0].entry?.url).toBe("https://github.com/a/one");
    expect(ed.picks[0].status).toBe("queued");
  });

  it("同一期重新保存会整期替换（编辑修订），不残留旧卡", async () => {
    await savePicks(db, "2026-10-04", [pick("repo:a/one", 1), pick("repo:b/two", 2)]);
    await savePicks(db, "2026-10-04", [pick("repo:c/three", 1)]);
    expect((await latestEdition(db))!.picks.map((p) => p.itemId)).toEqual(["repo:c/three"]);
  });

  it("较新的期号成为首页", async () => {
    await savePicks(db, "2026-10-04", [pick("repo:a/one", 1)]);
    await savePicks(db, "2026-10-05", [pick("repo:b/two", 1)]);
    expect((await latestEdition(db))!.edition).toBe("2026-10-05");
  });

  it("拒绝不在榜单上的条目、重复 rank 与缺字段", async () => {
    await expect(savePicks(db, "2026-10-04", [pick("repo:x/y", 1)])).rejects.toThrow(/条目不存在/);
    await expect(savePicks(db, "2026-10-04", [pick("repo:a/one", 1), pick("repo:b/two", 1)])).rejects.toThrow(/rank/);
    await expect(savePicks(db, "2026-10-04", [pick("repo:a/one", 1, { highlight: "" })])).rejects.toThrow(/字段/);
    await expect(savePicks(db, "2026-13-40", [pick("repo:a/one", 1)])).rejects.toThrow(/期号/);
  });

  it("工具型只写使用指南，不能排进精读", async () => {
    await expect(savePicks(db, "2026-10-04", [pick("repo:a/one", 1, { kind: "tool", plan: "deep" })])).rejects.toThrow(/工具/);
  });

  it("状态推进：排队 → 在读 → 已发布", async () => {
    await savePicks(db, "2026-10-04", [pick("repo:a/one", 1)]);
    expect(await setPickStatus(db, "2026-10-04", "repo:a/one", "published")).toBe(1);
    expect((await latestEdition(db))!.picks[0].status).toBe("published");
    expect(await setPickStatus(db, "2026-10-04", "repo:zz/zz", "published")).toBe(0);
  });
});
