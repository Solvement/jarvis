import { setReadingVisibility } from "@/lib/store";
import { isSameOrigin } from "@/lib/access";
import { getDb, json, viewerOf } from "@/lib/server";

type Body = { itemId?: string; generatedAt?: string; level?: string; visibility?: string };
const LEVELS = ["translation", "brief", "deep"] as const;

/** 讨论修订后发布草稿（或撤回为草稿）。作者凭证或作者会话。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "请从本站操作" }, 403);
  if (!(await viewerOf(request)).isOwner) return json({ error: "只有作者可以发布" }, 403);
  const body = (await request.json().catch(() => null)) as Body | null;
  const valid =
    body?.itemId && body.generatedAt && LEVELS.includes(body.level as (typeof LEVELS)[number]) && !Number.isNaN(Date.parse(body.generatedAt)) && (body.visibility === "draft" || body.visibility === "public");
  if (!valid) return json({ error: "需要 itemId、generatedAt、level、visibility" }, 400);
  const changed = await setReadingVisibility(await getDb(), body.itemId!, body.generatedAt!, body.level as (typeof LEVELS)[number], body.visibility as "draft" | "public");
  return changed ? json({ ok: true, changed }) : json({ error: "没有找到这个阅读版本" }, 404);
}
