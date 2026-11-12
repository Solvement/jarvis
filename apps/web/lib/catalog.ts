import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { readings, snapshots } from '@/db/schema';
import type { Db } from '@/db/client';
import type { Board, Reading, Viewer } from './types';

import { assembleCatalog } from './desk-model';
export { chooseReading } from './desk-model';

/**
 * 只取目录真正需要的快照全文。先读每份快照的条目 id（很小），再取：
 * 每个（条目, 来源日）最新的一份——保证条目、归档日期与全量读取一致；
 * 以及每个（榜单, 来源日）最新的一份——保证今日榜、往期榜和失败标记一致。
 * 同一天重复抓取的其余快照不再传输。only 给定时只看含该条目的快照。
 */
async function neededBoards(db: Db, only?: string): Promise<Board[]> {
  const rows = await db
    .select({
      id: snapshots.id,
      board: snapshots.board,
      day: sql<string>`${snapshots.payload}->>'sourceDate'`,
      at: sql<string>`${snapshots.payload}->>'fetchedAt'`,
      ids: sql<string[]>`jsonb_path_query_array(${snapshots.payload}, '$.items[*].id')`,
    })
    .from(snapshots)
    .where(only ? sql`${snapshots.payload}->'items' @> ${JSON.stringify([{ id: only }])}::jsonb` : undefined)
    .orderBy(desc(snapshots.fetchedAt));
  const keep = new Set<string>(), seen = new Set<string>();
  const first = (key: string, id: string) => { if (!seen.has(key)) { seen.add(key); keep.add(id); } };
  if (!only) for (const r of rows) first(`board\n${r.board}\n${r.day}`, r.id);
  // 与 assembleCatalog 相同的排序：按快照内的成功抓取时间，新的在前。
  for (const r of [...rows].sort((a, b) => b.at.localeCompare(a.at)))
    for (const item of only ? [only] : r.ids) first(`item\n${item}\n${r.day}`, r.id);
  if (!keep.size) return [];
  const full = await db.select({ payload: snapshots.payload }).from(snapshots)
    .where(inArray(snapshots.id, [...keep])).orderBy(desc(snapshots.fetchedAt));
  return full.map(r => r.payload as Board);
}

async function visibleReadings(db: Db, viewer: Viewer, itemId?: string): Promise<Reading[]> {
  const rows = await db.select({ payload: readings.payload, visibility: readings.visibility }).from(readings)
    .where(and(viewer.isOwner ? undefined : eq(readings.visibility, 'public'), itemId ? eq(readings.itemId, itemId) : undefined))
    .orderBy(desc(readings.generatedAt));
  return rows.map(r => ({ ...r.payload as Reading, visibility: r.visibility as Reading['visibility'] }));
}

export async function catalogContent(db: Db, viewer: Viewer) {
  const [boards, versions] = await Promise.all([neededBoards(db), visibleReadings(db, viewer)]);
  return { boards, versions, entries: assembleCatalog(boards, versions) };
}

/** 单条目：只读含该条目的快照和它自己的阅读版本，不加载整个资料库。 */
export async function entryContent(db: Db, viewer: Viewer, id: string) {
  const [boards, versions] = await Promise.all([neededBoards(db, id), visibleReadings(db, viewer, id)]);
  return { entry: assembleCatalog(boards, versions).find(e => e.id === id), versions };
}
