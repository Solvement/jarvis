import { setPickStatus } from "@/lib/picks";
import { isSameOrigin } from "@/lib/access";
import { errorMessage, getDb, json, viewerOf } from "@/lib/server";
import type { PickStatus } from "@/lib/types";

/** 推进看点卡状态（排队 → 在读 → 已发布）。作者凭证或作者会话。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "请从本站操作" }, 403);
  if (!(await viewerOf(request)).isOwner) return json({ error: "只有作者可以修改" }, 403);
  const body = (await request.json().catch(() => null)) as { edition?: string; itemId?: string; status?: string } | null;
  if (!body?.edition || !body.itemId || !body.status) return json({ error: "需要 edition、itemId、status" }, 400);
  try {
    const changed = await setPickStatus(await getDb(), body.edition, body.itemId, body.status as PickStatus);
    return changed ? json({ ok: true }) : json({ error: "没有找到这张看点卡" }, 404);
  } catch (e) {
    return json({ error: errorMessage(e, "状态无效") }, 400);
  }
}
