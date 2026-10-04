import { refresh } from "@/lib/store";
import { fetchBoard } from "@/lib/sources";
import { isSameOrigin } from "@/lib/access";
import { getDb, json, viewerOf } from "@/lib/server";

export const maxDuration = 60;

/** 访客按钮刷新：同源 + 2 分钟锁。 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "请从本站刷新" }, 403);
  try {
    const viewer = await viewerOf(request);
    return json(await refresh(await getDb(), fetchBoard, Date.now(), viewer));
  } catch (e) {
    console.error("refresh", e);
    return json({ error: "刷新暂未完成，已有内容仍然保留。请重试。" }, 503);
  }
}
