import { getDb } from "@/db/client";
import { getAuth, isAuthConfigured } from "./auth";
import { bearerMatches, isOwnerEmail } from "./access";

export type RequestViewer = { userId: string | null; email: string | null; isOwner: boolean };

/** 会话里的用户；作者身份来自 OWNER_EMAILS，或持有 AUTHOR_TOKEN。 */
export async function viewerOf(request: Request): Promise<RequestViewer> {
  if (bearerMatches(request, process.env.AUTHOR_TOKEN)) return { userId: null, email: null, isOwner: true };
  if (!isAuthConfigured()) return { userId: null, email: null, isOwner: false };
  const session = await (await getAuth()).api.getSession({ headers: request.headers });
  const email = session?.user.email ?? null;
  return { userId: session?.user.id ?? null, email, isOwner: isOwnerEmail(email, process.env.OWNER_EMAILS) };
}

export { getDb };

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const errorMessage = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
