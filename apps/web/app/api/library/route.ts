import { library } from "@/lib/store";
import { getDb, json, viewerOf } from "@/lib/server";
import { isAuthConfigured } from "@/lib/auth";
import { latestEdition } from "@/lib/picks";

export async function GET(request: Request) {
  try {
    const viewer = await viewerOf(request);
    const db = await getDb();
    const [lib, edition] = await Promise.all([library(db, viewer), latestEdition(db)]);
    return json({ ...lib, edition, viewer: { signedIn: !!viewer.userId, isOwner: viewer.isOwner, authEnabled: isAuthConfigured() } });
  } catch (e) {
    console.error("library", e);
    return json({ error: "资料库暂不可用，请稍后重试。" }, 503);
  }
}
