// 一次性迁移：把旧站 /api/library 的导出（最新六榜 + 全部阅读版本）写入新库。
// 用法：node scripts/import-legacy.ts <library.json>
// 旧阅读原样保留（含未补齐研读记录、显示"待复核"的历史精读），不经新准入校验，也不改动其内容。
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createNeonDb, createPgliteDb } from "../db/client.ts";
import { readings, snapshots } from "../db/schema.ts";

type LegacyBoard = { id: string; fetchedAt: string; [k: string]: unknown };
type LegacyReading = { itemId: string; sourceHash: string; level: string; generatedAt: string; [k: string]: unknown };

const file = process.argv[2];
if (!file) throw new Error("需要 library.json 路径");
const lib = JSON.parse(readFileSync(file, "utf8")) as { boards: LegacyBoard[]; readings: LegacyReading[] };

const db = process.env.DATABASE_URL ? await createNeonDb(process.env.DATABASE_URL) : await createPgliteDb(".pglite");

const snap = lib.boards.map((b) => ({ id: `${b.id}:${b.fetchedAt}`, board: b.id, fetchedAt: new Date(b.fetchedAt), payload: b }));
const rows = lib.readings.map((r) => ({
  id: createHash("sha256").update(JSON.stringify(r)).digest("hex"),
  itemId: r.itemId,
  sourceHash: r.sourceHash,
  level: r.level,
  visibility: "public",
  generatedAt: new Date(r.generatedAt),
  payload: r,
}));

await db.transaction(async (tx) => {
  if (snap.length) await tx.insert(snapshots).values(snap).onConflictDoNothing();
  for (let i = 0; i < rows.length; i += 100) await tx.insert(readings).values(rows.slice(i, i + 100)).onConflictDoNothing();
});
console.log(`[import-legacy] 榜单快照 ${snap.length}，阅读版本 ${rows.length}（重复项已忽略）。`);
process.exit(0);
