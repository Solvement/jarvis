import { library } from "@/lib/store";
import { getDb, json, viewerOf } from "@/lib/server";
import { isAuthConfigured } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const viewer = await viewerOf(request);
    const lib = await library(await getDb(), viewer);
    return json({ ...lib, viewer: { signedIn: !!viewer.userId, isOwner: viewer.isOwner, authEnabled: isAuthConfigured() } });
  } catch (e) {
    console.error("library", e);
    return json({ error: "资料库暂不可用，请稍后重试。" }, 503);
  }
}
