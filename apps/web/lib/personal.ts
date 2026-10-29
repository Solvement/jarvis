import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { personalCollections } from '@/db/schema';
import type { PersonalCollection } from './desk-types';

export async function getCollections(db: Db, userId: string): Promise<PersonalCollection[]> {
  const rows = await db.select().from(personalCollections).where(eq(personalCollections.userId,userId)).orderBy(desc(personalCollections.updatedAt));
  return rows.map(r => ({ id:r.id,title:r.title,items:r.items,updatedAt:r.updatedAt.toISOString() }));
}
export async function saveCollection(db: Db, userId: string, body: { id?:string; title:string; items:string[] }) {
  if (!body.title.trim() || body.title.length>60) throw new Error('合集名称需要 1–60 字');
  if (body.items.length>500 || body.items.some(id => typeof id!=='string' || !id || id.length>300)) throw new Error('合集最多保存 500 个有效条目');
  const values = { title:body.title.trim(),items:[...new Set(body.items)],updatedAt:new Date() };
  if (body.id) {
    const rows = await db.update(personalCollections).set(values).where(and(eq(personalCollections.id,body.id),eq(personalCollections.userId,userId))).returning({ id:personalCollections.id });
    if (!rows.length) throw new Error('合集不存在');
  } else {
    if ((await getCollections(db,userId)).length>=100) throw new Error('最多创建 100 个合集');
    await db.insert(personalCollections).values({ ...values,id:randomUUID(),userId });
  }
  return getCollections(db,userId);
}
export async function deleteCollection(db: Db, userId:string, id:string) {
  await db.delete(personalCollections).where(and(eq(personalCollections.id,id),eq(personalCollections.userId,userId)));
  return getCollections(db,userId);
}
