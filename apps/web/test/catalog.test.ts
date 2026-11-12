import { describe, expect, it } from 'vitest';
import { desc } from 'drizzle-orm';
import { createPgliteDb } from '@/db/client';
import { snapshots } from '@/db/schema';
import { catalogContent, entryContent } from '@/lib/catalog';
import { assembleCatalog } from '@/lib/desk-model';
import { ensureDiscoveryToday, importReadings, saveSnapshot } from '@/lib/store';
import type { Board, Entry, Reading } from '@/lib/types';

const entry = (id: string, rank = 1): Entry => ({ id, kind: id.startsWith('paper') ? 'paper' : 'project', title: id, summary: id, url: 'https://example.test', rank, sourceHash: id });
const board = (id: string, day: string, hour: string, items: Entry[]): Board => {
  const [source, period] = id.split(':') as [Board['source'], Board['period']];
  return { id, source, period, sourceDate: day, fetchedAt: `${day}T${hour}:00:00.000Z`, url: 'https://example.test', items, contentHash: day + hour };
};
const reading = (itemId: string): Reading => ({ itemId, sourceHash: itemId, level: 'brief', title: '解读 ' + itemId, summary: 's', generatedAt: '2026-10-02T00:00:00.000Z', author: 'a', coverage: 'abstract',
  sections: [{ heading: 'h', body: 'b', citations: ['s1'] }], sources: [{ id: 's1', title: 't', url: 'https://example.test' }], limitations: ['l'] });
const allBoards = async (db: Awaited<ReturnType<typeof createPgliteDb>>) =>
  (await db.select({ payload: snapshots.payload }).from(snapshots).orderBy(desc(snapshots.fetchedAt))).map(r => r.payload as Board);

describe('目录按需读取快照', () => {
  it('结果与读取全部快照一致：早间上榜后离榜的条目、跨日日期、失败标记都保留', async () => {
    const db = await createPgliteDb();
    const a = entry('repo:a/a'), gone = entry('repo:b/gone', 2), c = entry('repo:c/c'), p = entry('paper:2610.00001');
    await saveSnapshot(db, board('github:daily', '2026-10-01', '09', [a, gone]));
    await saveSnapshot(db, board('github:daily', '2026-10-01', '17', [a]));           // gone 当天晚些时候离榜
    await saveSnapshot(db, board('github:daily', '2026-10-02', '09', [{ ...a, stars: 9 }, c]));
    await saveSnapshot(db, board('github:weekly', '2026-10-02', '09', [c, a]));
    await saveSnapshot(db, board('hf:daily', '2026-10-01', '10', [p]));
    const old = board('hf:daily', '2026-10-01', '10', [p]);
    await saveSnapshot(db, { ...old, stale: true, error: 'x' }, 'hf:daily:today-error:2026-10-02', '2026-10-02T12:00:00.000Z', true);
    await importReadings(db, [reading(a.id)]);

    const everything = await allBoards(db);
    const got = await catalogContent(db, { isOwner: false });
    expect(got.boards.length).toBeLessThan(everything.length);
    expect(got.entries).toEqual(assembleCatalog(everything, got.versions));
    expect(got.entries.find(e => e.id === gone.id)?.editions).toEqual(['2026-10-01']);
    // 路由用到的两个投影：每榜最新一份（含失败标记）、每榜每来源日最新一份。
    // 客户端按 id / 来源日查找，数组顺序无含义，按键排序后比较。
    const byKey = (m: Map<string, Board>) => [...m.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([, b]) => b);
    const latest = (boards: Board[]) => byKey(new Map(boards.map(b => [b.id, b] as const).reverse()));
    const perDay = (boards: Board[]) => byKey(new Map(boards.map(b => [`${b.id}:${b.sourceDate}`, b] as const).reverse()));
    expect(latest(got.boards)).toEqual(latest(everything));
    expect(perDay(got.boards)).toEqual(perDay(everything));
    expect(latest(got.boards).find(b => b.id === 'hf:daily')?.stale).toBe(true);

    const full = assembleCatalog(everything, got.versions);
    for (const e of full) {
      const one = await entryContent(db, { isOwner: false }, e.id);
      expect(one.entry).toEqual(e);
      expect(one.versions).toEqual(got.versions.filter(r => r.itemId === e.id));
    }
    expect((await entryContent(db, { isOwner: false }, 'repo:missing/x')).entry).toBeUndefined();
  });

  it('来源当天未出榜时反复检查，失败记录每榜每天只有一行', async () => {
    const db = await createPgliteDb(), day = '2026-10-19', now = Date.parse(day + 'T12:00:00Z');
    await saveSnapshot(db, board('hf:daily', '2026-10-18', '12', [entry('paper:2610.00002')]));
    const notYet = async (source: Board['source'], period: Board['period']) =>
      ({ ...board(`${source}:${period}`, source === 'hf' ? '2026-10-18' : day, '12', []), fetchedAt: new Date(now).toISOString() });
    for (let i = 0; i < 4; i++) await ensureDiscoveryToday(db, notYet, day, now + i * 180_000);
    const stale = (await allBoards(db)).filter(b => b.stale);
    expect(stale).toHaveLength(1);
    expect(stale[0]).toMatchObject({ id: 'hf:daily', sourceDate: '2026-10-18' });
  });
});
