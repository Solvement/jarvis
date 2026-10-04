import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { itemStates, readings, refreshLocks, snapshots } from "@/db/schema";
import type { Board, ItemState, Library, Period, Reading, Source, Viewer, Visibility } from "./types";
import { hash } from "./sources";
import { validateDeep } from "./reading-quality";
import attributions from "./paper-attributions.json";

export type BoardFetcher = (source: Source, period: Period) => Promise<Board>;

const SOURCES: Source[] = ["github", "hf"];
const PERIODS: Period[] = ["daily", "weekly", "monthly"];
const LOCK_MS = 120_000;
const MAX_BATCH = 300;
const MAX_NOTE = 20_000;

export async function latestBoards(db: Db): Promise<Board[]> {
  const rows = await db
    .selectDistinctOn([snapshots.board], { payload: snapshots.payload })
    .from(snapshots)
    .orderBy(snapshots.board, desc(snapshots.fetchedAt));
  const boards = rows.map((r) => r.payload as Board);
  for (const b of boards)
    for (const e of b.items) {
      const a = attributions[e.id as keyof typeof attributions];
      if (a) e.attribution = a;
    }
  return boards;
}

export async function library(db: Db, viewer: Viewer): Promise<Library> {
  const rows = await db
    .select({ payload: readings.payload, visibility: readings.visibility })
    .from(readings)
    .where(viewer.isOwner ? undefined : eq(readings.visibility, "public"))
    .orderBy(desc(readings.generatedAt));
  return {
    boards: await latestBoards(db),
    readings: rows.map((r) => ({ ...(r.payload as Reading), visibility: r.visibility as Visibility })),
  };
}

/** at 是快照的排序时间；失败记录用检查时间排序，payload 内保留上次成功的 fetchedAt。 */
export async function saveSnapshot(db: Db, b: Board, id = `${b.id}:${b.fetchedAt}`, at = b.fetchedAt): Promise<void> {
  await db
    .insert(snapshots)
    .values({ id, board: b.id, fetchedAt: new Date(at), payload: b })
    .onConflictDoNothing();
}

/** 取锁成功返回 true。锁过期（> 2 分钟）才可再次获取。 */
async function acquireLock(db: Db, now: number): Promise<boolean> {
  const rows = await db
    .insert(refreshLocks)
    .values({ id: "sources", expires: now + LOCK_MS })
    .onConflictDoUpdate({
      target: refreshLocks.id,
      set: { expires: now + LOCK_MS },
      setWhere: lt(refreshLocks.expires, now),
    })
    .returning({ id: refreshLocks.id });
  return rows.length > 0;
}

/** 抓取六榜。单榜失败时保留上次成功内容，另存一份带 stale 标记的快照作为失败记录。 */
export async function refresh(db: Db, fetchBoard: BoardFetcher, now = Date.now()): Promise<Library> {
  if (!(await acquireLock(db, now)))
    return { ...(await library(db, { isOwner: false })), notice: "刚刚已发起刷新，请稍后重试。刷新间隔为 2 分钟。" };
  const previous = new Map((await latestBoards(db)).map((b) => [b.id, b]));
  const targets = SOURCES.flatMap((s) => PERIODS.map((p) => [s, p] as const));
  const results = await Promise.allSettled(targets.map(([s, p]) => fetchBoard(s, p)));
  const failed: string[] = [];
  const checkedAt = new Date(now).toISOString();
  for (const [i, res] of results.entries()) {
    const id = `${targets[i][0]}:${targets[i][1]}`;
    if (res.status === "fulfilled") {
      await saveSnapshot(db, res.value);
      continue;
    }
    failed.push(id);
    const old = previous.get(id);
    if (!old) continue;
    const error = res.reason instanceof Error ? res.reason.message : "来源暂不可用";
    await saveSnapshot(db, { ...old, stale: true, error }, `${id}:error:${checkedAt}`, checkedAt);
  }
  const lib = await library(db, { isOwner: false });
  if (failed.length) lib.notice = `${failed.length} 个榜单暂未更新，已保留上次成功内容。`;
  return lib;
}

function checkReading(r: Reading): void {
  if (!["translation", "brief", "deep"].includes(r.level) || !r.title || !r.summary || !r.author || !r.generatedAt || Number.isNaN(Date.parse(r.generatedAt)))
    throw new Error("阅读结果字段不完整");
  if (!Array.isArray(r.sections) || !Array.isArray(r.sources) || !Array.isArray(r.limitations)) throw new Error("缺少章节、来源或边界");
  if (r.level !== "translation" && (!r.sections.length || !r.sources.length || !r.limitations.length)) throw new Error("分析须有章节、来源及局限");
  const ids = new Set(r.sources.map((s) => s.id));
  if (r.sources.some((s) => !/^https:\/\//.test(s.url))) throw new Error("来源链接须为 HTTPS");
  if (r.sections.some((s) => !s.heading || !s.body || !s.citations?.length || s.citations.some((c) => !ids.has(c))))
    throw new Error("章节引用无效");
  validateDeep(r);
}

/** D-007：精读要与用户讨论修订后才公开，默认草稿；翻译与摘要默认公开。 */
export function defaultVisibility(r: Reading): Visibility {
  return r.level === "deep" ? "draft" : "public";
}

/** 整批校验通过才写入；任何一条无效则整批不写。版本只追加，内容 hash 作主键保证幂等。 */
export async function importReadings(
  db: Db,
  payload: unknown,
  opts: { visibility?: Visibility } = {},
): Promise<{ ok: true; count: number }> {
  if (!Array.isArray(payload) || !payload.length || payload.length > MAX_BATCH) throw new Error(`需要 1–${MAX_BATCH} 条阅读结果`);
  const entries = new Map((await latestBoards(db)).flatMap((b) => b.items).map((e) => [e.id, e]));
  const rows: (typeof readings.$inferInsert)[] = [];
  for (const raw of payload as Reading[]) {
    const e = entries.get(raw?.itemId);
    if (!e) throw new Error(`条目不存在：${raw?.itemId}`);
    if (raw.sourceHash !== e.sourceHash) throw new Error(`来源已改变：${raw.itemId}`);
    checkReading(raw);
    const { visibility: _ignored, ...rest } = raw;
    const r: Reading = { ...rest, entry: e };
    rows.push({
      id: await hash(JSON.stringify(r)),
      itemId: r.itemId,
      sourceHash: r.sourceHash,
      level: r.level,
      visibility: opts.visibility ?? defaultVisibility(r),
      generatedAt: new Date(r.generatedAt),
      payload: r,
    });
  }
  await db.transaction(async (tx) => {
    await tx.insert(readings).values(rows).onConflictDoNothing();
  });
  return { ok: true, count: rows.length };
}

export async function setReadingVisibility(db: Db, itemId: string, generatedAt: string, visibility: Visibility): Promise<number> {
  const rows = await db
    .update(readings)
    .set({ visibility })
    .where(and(eq(readings.itemId, itemId), eq(readings.generatedAt, new Date(generatedAt))))
    .returning({ id: readings.id });
  return rows.length;
}

export async function getItemStates(db: Db, userId: string, itemIds?: string[]): Promise<Record<string, ItemState>> {
  const rows = await db
    .select()
    .from(itemStates)
    .where(itemIds?.length ? and(eq(itemStates.userId, userId), inArray(itemStates.itemId, itemIds)) : eq(itemStates.userId, userId));
  return Object.fromEntries(
    rows.map((r) => [
      r.itemId,
      { readAt: r.readAt?.toISOString() ?? null, starred: r.starred, note: r.note, updatedAt: r.updatedAt.toISOString() },
    ]),
  );
}

export type ItemStatePatch = { read?: boolean; starred?: boolean; note?: string };

/** 只更新传入的字段。已读必须由用户显式设置（AUTHORING 证据边界）。 */
export async function setItemState(db: Db, userId: string, itemId: string, patch: ItemStatePatch): Promise<void> {
  if (!itemId || itemId.length > 300) throw new Error("条目无效");
  if (patch.note !== undefined && patch.note.length > MAX_NOTE) throw new Error(`笔记不能超过 ${MAX_NOTE} 字`);
  const now = new Date();
  const set: Partial<typeof itemStates.$inferInsert> = { updatedAt: now };
  if (patch.read !== undefined) set.readAt = patch.read ? now : null;
  if (patch.starred !== undefined) set.starred = patch.starred;
  if (patch.note !== undefined) set.note = patch.note;
  await db
    .insert(itemStates)
    .values({ userId, itemId, readAt: set.readAt ?? null, starred: set.starred ?? false, note: set.note ?? "", updatedAt: now })
    .onConflictDoUpdate({ target: [itemStates.userId, itemStates.itemId], set });
}

