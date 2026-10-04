import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { picks } from "@/db/schema";
import { knownEntries } from "./store";
import type { Edition, Pick, PickKind, PickPlan, PickStatus } from "./types";

export type PickInput = Omit<Pick, "status" | "entry"> & { status?: PickStatus };

const KINDS: PickKind[] = ["core", "tool", "paper"];
const PLANS: PickPlan[] = ["deep", "guide", "brief"];
const STATUSES: PickStatus[] = ["queued", "reading", "published"];
const MAX_PICKS = 60;

function isEdition(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function check(p: PickInput): void {
  const text = [p.headline, p.highlight, p.why, p.board, p.coverage];
  if (!p.itemId || !Number.isInteger(p.rank) || p.rank < 1 || text.some((t) => typeof t !== "string" || !t.trim()))
    throw new Error(`看点卡字段不完整：${p.itemId}`);
  if (!KINDS.includes(p.kind) || !PLANS.includes(p.plan)) throw new Error(`看点卡类型无效：${p.itemId}`);
  if (p.status && !STATUSES.includes(p.status)) throw new Error(`看点卡状态无效：${p.itemId}`);
  // D-004：工具型项目会用即可，不排进精读。
  if (p.kind === "tool" && p.plan === "deep") throw new Error(`工具型项目只写使用指南：${p.itemId}`);
}

/** 整期保存：校验全部通过后，事务内删除该期旧卡再写入。 */
export async function savePicks(db: Db, edition: string, input: PickInput[]): Promise<{ ok: true; count: number }> {
  if (!isEdition(edition)) throw new Error("期号须为 YYYY-MM-DD");
  if (!Array.isArray(input) || !input.length || input.length > MAX_PICKS) throw new Error(`需要 1–${MAX_PICKS} 张看点卡`);
  input.forEach(check);
  const ranks = new Set(input.map((p) => p.rank));
  const ids = new Set(input.map((p) => p.itemId));
  if (ranks.size !== input.length) throw new Error("同一期内 rank 不能重复");
  if (ids.size !== input.length) throw new Error("同一期内条目不能重复");
  const entries = await knownEntries(db, [...ids]);
  for (const p of input) if (!entries.has(p.itemId)) throw new Error(`条目不存在：${p.itemId}`);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.delete(picks).where(eq(picks.edition, edition));
    await tx.insert(picks).values(
      input.map(({ status, ...rest }) => ({ edition, itemId: rest.itemId, rank: rest.rank, status: status ?? "queued", payload: rest, updatedAt: now })),
    );
  });
  return { ok: true, count: input.length };
}

export async function latestEdition(db: Db): Promise<Edition | null> {
  const [top] = await db.select({ edition: picks.edition }).from(picks).orderBy(desc(picks.edition)).limit(1);
  if (!top) return null;
  const rows = await db.select().from(picks).where(eq(picks.edition, top.edition)).orderBy(picks.rank);
  const entries = await knownEntries(db, rows.map((r) => r.itemId));
  return {
    edition: top.edition,
    picks: rows.map((r) => ({ ...(r.payload as Omit<Pick, "status">), status: r.status as PickStatus, entry: entries.get(r.itemId) })),
  };
}

export async function setPickStatus(db: Db, edition: string, itemId: string, status: PickStatus): Promise<number> {
  if (!STATUSES.includes(status)) throw new Error("状态无效");
  const rows = await db
    .update(picks)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(picks.edition, edition), eq(picks.itemId, itemId)))
    .returning({ itemId: picks.itemId });
  return rows.length;
}
