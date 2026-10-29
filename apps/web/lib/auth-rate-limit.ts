import { createHash } from 'node:crypto';
import { and, like, lte } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { refreshLocks } from '@/db/schema';

/** 每个请求占一个到期槽位；原子 upsert 使不同函数实例共享限额，无需改表。 */
export function authRateLimit(db: Db, now = Date.now) {
  return {
    async consume(key: string, rule: { window: number; max: number }) {
      const timestamp = now();
      const prefix = `auth-rate:${createHash('sha256').update(key).digest('hex')}:`;
      const expires = timestamp + rule.window * 1000;
      await db.delete(refreshLocks).where(and(like(refreshLocks.id, 'auth-rate:%'), lte(refreshLocks.expires, timestamp)));
      for (let slot = 0; slot < rule.max; slot++) {
        const id = `${prefix}${slot}`;
        const reserved = await db.insert(refreshLocks).values({ id, expires }).onConflictDoUpdate({
          target: refreshLocks.id, set: { expires }, setWhere: lte(refreshLocks.expires, timestamp),
        }).returning({ id: refreshLocks.id });
        if (reserved.length) return { allowed: true, retryAfter: null };
      }
      const slots = await db.select({ expires: refreshLocks.expires }).from(refreshLocks).where(like(refreshLocks.id, `${prefix}%`));
      const next = Math.min(...slots.map(row => row.expires), expires);
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((next - timestamp) / 1000)) };
    },
  };
}
