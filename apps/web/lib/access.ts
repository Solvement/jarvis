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
  const url=new URL(request.url);
  const host=request.headers.get('host');
  // Next 开发服务器构造的 Request URL 可能为 localhost，浏览器实际访问 127.0.0.1。
  const expected=isLoopback(url.hostname)&&host&&isLoopbackHost(host,url.port) ? `${url.protocol}//${host}`:url.origin;
  return !origin || origin === expected;
}

const isLoopback=(hostname:string)=>['localhost','127.0.0.1','[::1]'].includes(hostname);
function isLoopbackHost(host:string,port:string):boolean {
  try { const parsed=new URL(`http://${host}`);return parsed.host===host&&isLoopback(parsed.hostname)&&parsed.port===port; }
  catch {return false;}
}

/** 本机个人模式必须显式打开，只允许无远端库的开发服务器回环地址。 */
export function isLocalPersonalRequest(request: Request, env = process.env): boolean {
  const url=new URL(request.url),host=url.hostname;
  const forwarded=request.headers.get('x-forwarded-host');
  const rawHost=request.headers.get('host');
  const validHost=(value:string|null)=>!value || isLoopbackHost(value,url.port);
  return env.NODE_ENV === 'development' && env.PERSONAL_LOCAL_MODE === '1' && !env.DATABASE_URL
    && isLoopback(host)
    && validHost(rawHost) && validHost(forwarded) && request.headers.get('sec-fetch-site') !== 'cross-site'
    && isSameOrigin(request);
}
