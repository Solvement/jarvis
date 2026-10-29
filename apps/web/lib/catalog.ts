import { desc, eq } from 'drizzle-orm';
import { readings, snapshots } from '@/db/schema';
import type { Db } from '@/db/client';
import type { Board, Entry, Reading, Viewer } from './types';
import type { DeskEntry } from './desk-types';

import { assembleCatalog } from './desk-model';
export { chooseReading } from './desk-model';

export async function catalogContent(db: Db, viewer: Viewer) {
  const [storedBoards, storedReadings] = await Promise.all([
    db.select({ payload:snapshots.payload }).from(snapshots).orderBy(desc(snapshots.fetchedAt)),
    db.select({ payload:readings.payload, visibility:readings.visibility }).from(readings)
      .where(viewer.isOwner ? undefined : eq(readings.visibility,'public')).orderBy(desc(readings.generatedAt)),
  ]);
  const boards = storedBoards.map(r => r.payload as Board);
  const versions = storedReadings.map(r => ({ ...r.payload as Reading, visibility:r.visibility as Reading['visibility'] }));
  return { boards, versions, entries:assembleCatalog(boards,versions) };
}

export async function entryContent(db: Db, viewer: Viewer, id: string) {
  const { entries, versions } = await catalogContent(db,viewer);
  return { entry:entries.find(e => e.id===id), versions:versions.filter(r => r.itemId===id) };
}
