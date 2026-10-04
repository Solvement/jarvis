import { getItemStates, setItemState } from "@/lib/store";
import { isSameOrigin } from "@/lib/access";
import { errorMessage, getDb, json, viewerOf } from "@/lib/server";

export async function GET(request: Request) {
  const viewer = await viewerOf(request);
  if (!viewer.userId) return json({ error: "请先登录" }, 401);
  return json({ states: await getItemStates(await getDb(), viewer.userId) });
}

type Body = { itemId?: unknown; read?: unknown; starred?: unknown; note?: unknown };

/** 只由用户本人显式写入已读、收藏、笔记。 */
export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "请从本站操作" }, 403);
  const viewer = await viewerOf(request);
  if (!viewer.userId) return json({ error: "请先登录" }, 401);
  const body = (await request.json().catch(() => null)) as Body | null;
  if (!body || typeof body.itemId !== "string") return json({ error: "需要 itemId" }, 400);
  const patch = {
    read: typeof body.read === "boolean" ? body.read : undefined,
    starred: typeof body.starred === "boolean" ? body.starred : undefined,
    note: typeof body.note === "string" ? body.note : undefined,
  };
  try {
    const db = await getDb();
    await setItemState(db, viewer.userId, body.itemId, patch);
    return json({ ok: true, states: await getItemStates(db, viewer.userId, [body.itemId]) });
  } catch (e) {
    return json({ error: errorMessage(e, "保存失败") }, 400);
  }
}
