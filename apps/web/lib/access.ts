import { timingSafeEqual } from "node:crypto";

/** 常数时间比较 Bearer 凭证；服务器没配凭证时一律拒绝。 */
export function bearerMatches(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export function isOwnerEmail(email: string | undefined | null, ownerEmails: string | undefined): boolean {
  if (!email || !ownerEmails) return false;
  const owners = ownerEmails.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return owners.includes(email.trim().toLowerCase());
}

/** 浏览器写请求必须同源；无 Origin（服务器到服务器）交由凭证或会话判断。 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
