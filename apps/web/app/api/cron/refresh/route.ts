import { refresh } from "@/lib/store";
import { fetchBoard } from "@/lib/sources";
import { bearerMatches } from "@/lib/access";
import { getDb, json } from "@/lib/server";

export const maxDuration = 60;

/** Vercel Cron 每日调用，携带 Authorization: Bearer $CRON_SECRET。 */
export async function GET(request: Request) {
  if (!bearerMatches(request, process.env.CRON_SECRET)) return json({ error: "unauthorized" }, 401);
  try {
    const lib = await refresh(await getDb(), fetchBoard);
    const boards = lib.boards.map((b) => ({ id: b.id, items: b.items.length, stale: !!b.stale, sourceDate: b.sourceDate }));
    return json({ ok: !lib.notice, notice: lib.notice ?? null, boards });
  } catch (e) {
    console.error("cron refresh", e);
    return json({ error: "refresh failed" }, 503);
  }
}
