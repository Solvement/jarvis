import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { createPgliteDb, type Db } from '@/db/client';
import { account, refreshLocks, user, verification } from '@/db/schema';
import { buildAuth } from '@/lib/auth';
import * as authModule from '@/lib/auth';
import { authRateLimit } from '@/lib/auth-rate-limit';
import { getItemStates, setItemState } from '@/lib/store';
import { viewerOf } from '@/lib/server';

const origin = 'https://new.jarvis.test';
const env = { NODE_ENV: 'test', BETTER_AUTH_URL: 'https://old.jarvis.test', AUTH_TRUSTED_ORIGINS: origin,
  BETTER_AUTH_SECRET: 'isolated-test-secret-with-at-least-32-characters', RESEND_API_KEY: 'test-fixture-no-network', RESEND_EMAIL_DOMAIN: 'mail.jarvis.test' } as NodeJS.ProcessEnv;
let db: Db;
let auth: ReturnType<typeof buildAuth>;
const deliveries = new Map<string, string>();
let ip = 0;
const deliver = async ({ email, otp }: { email: string; otp: string }) => { deliveries.set(email, otp); };
function post(path: string, body: unknown, instance = auth, requestOrigin = origin) {
  return instance.handler(new Request(`${origin}/api/auth${path}`, { method: 'POST', headers: {
    'content-type': 'application/json', origin: requestOrigin, 'x-forwarded-for': `192.0.2.${++ip % 250 + 1}`,
  }, body: JSON.stringify(body) }));
}
const send = (email: string, instance = auth) => post('/email-otp/send-verification-otp', { email, type: 'sign-in' }, instance);
const verify = (email: string, otp = deliveries.get(email)) => post('/sign-in/email-otp', { email, otp });
const cookies = (response: Response) => response.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');

beforeAll(async () => {
  db = await createPgliteDb();
  auth = buildAuth(db, env, deliver);
  await db.insert(user).values({ id: 'original-github-user', name: 'Original', email: 'original@example.test', emailVerified: true });
  await db.insert(account).values({ id: 'original-github-account', accountId: '123456', providerId: 'github', userId: 'original-github-user' });
  await setItemState(db, 'original-github-user', 'paper:keep', { starred: true, note: '原来的私人笔记' });
  vi.stubEnv('RESEND_API_KEY', 'test-fixture-no-network');
  vi.stubEnv('RESEND_EMAIL_DOMAIN', 'mail.jarvis.test');
  vi.stubEnv('OWNER_EMAILS', 'original@example.test');
  vi.spyOn(authModule, 'getAuth').mockResolvedValue(auth);
});
afterAll(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('真实 Better Auth handler + 邮箱 OTP + 隔离 PostgreSQL', () => {
  it('原 GitHub 邮箱复用用户和绑定，刷新会话仍能读原收藏和笔记', async () => {
    expect((await send(' Original@Example.test ')).status).toBe(200);
    const code = deliveries.get('original@example.test')!;
    expect(code).toMatch(/^\d{6}$/);
    const stored = await db.select().from(verification).where(eq(verification.identifier, 'sign-in-otp-original@example.test'));
    expect(stored[0].value).not.toContain(code);
    const response = await verify('original@example.test');
    expect(response.status).toBe(200);
    expect((await response.clone().json()).user.id).toBe('original-github-user');
    const headers = { cookie: cookies(response), host: 'new.jarvis.test' };
    const refreshed = await auth.handler(new Request(`${origin}/api/auth/get-session`, { headers }));
    expect((await refreshed.json()).user.id).toBe('original-github-user');
    const viewer = await viewerOf(new Request(`${origin}/api/me/state`, { headers }));
    expect(viewer).toMatchObject({ userId: 'original-github-user', isOwner: true });
    expect((await getItemStates(db, viewer.userId!))['paper:keep']).toMatchObject({ starred: true, note: '原来的私人笔记' });
    expect(await db.select().from(account)).toMatchObject([{ id: 'original-github-account', userId: 'original-github-user', providerId: 'github' }]);
    expect(await db.select().from(user).where(eq(user.email, 'original@example.test'))).toHaveLength(1);
    expect((await verify('original@example.test', code)).status).toBe(400);
  });

  it('新读者验证邮箱后建立持久会话，无法取得作者身份或他人状态', async () => {
    expect((await send('reader@example.test')).status).toBe(200);
    const response = await verify('reader@example.test');
    expect(response.status).toBe(200);
    const body = await response.clone().json();
    expect(body.user.emailVerified).toBe(true);
    const viewer = await viewerOf(new Request(`${origin}/api/me/state`, { headers: { cookie: cookies(response), host: 'new.jarvis.test' } }));
    expect(viewer).toMatchObject({ userId: body.user.id, isOwner: false });
    expect(await getItemStates(db, viewer.userId!)).toEqual({});
  });

  it('错误验证码最多尝试三次，随后正确验证码也不能登录', async () => {
    const email = 'wrong@example.test';
    await send(email);
    const wrong = deliveries.get(email) === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 3; attempt++) expect((await verify(email, wrong)).status).toBe(400);
    expect((await verify(email)).status).toBe(403);
    expect(await db.select().from(user).where(eq(user.email, email))).toHaveLength(0);
  });

  it('过期验证码被拒绝并清理', async () => {
    const email = 'expired@example.test';
    await send(email);
    await db.update(verification).set({ expiresAt: new Date(0) }).where(eq(verification.identifier, `sign-in-otp-${email}`));
    const response = await verify(email);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('OTP_EXPIRED');
  });

  it('新函数实例共享邮箱发送冷却，跨站请求和非登录用途不能发信', async () => {
    const email = 'limited@example.test';
    expect((await send(email)).status).toBe(200);
    const another = buildAuth(db, env, deliver);
    expect((await send(email, another)).status).toBe(429);
    expect((await post('/email-otp/send-verification-otp', { email, type: 'sign-in' }, auth, 'https://evil.test')).status).toBe(403);
    expect((await post('/email-otp/send-verification-otp', { email, type: 'forget-password' })).status).toBe(400);
    expect((await post('/email-otp/reset-password', { email, otp: '000000', password: 'arbitrary-test-password' })).status).toBe(404);
  });

  it('邮件服务失败返回真实错误，不签发会话', async () => {
    const failure = buildAuth(db, env, async () => { throw Error('transport unavailable'); });
    const response = await send('delivery-failed@example.test', failure);
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('并发使用同一验证码只允许一个请求成功', async () => {
    const email = 'concurrent@example.test';
    await send(email);
    const responses = await Promise.all([verify(email), verify(email)]);
    expect(responses.filter(response => response.status === 200)).toHaveLength(1);
    expect(responses.filter(response => response.status === 400)).toHaveLength(1);
  });
});

describe('共享数据库发送/验证限额', () => {
  it('并发请求不能超过额度，滚动窗口到期后恢复且不碰资料抓取锁', async () => {
    let clock = Date.now();
    await db.insert(refreshLocks).values({ id: 'source-test-lock', expires: clock - 100 });
    const a = authRateLimit(db, () => clock), b = authRateLimit(db, () => clock);
    const attempts = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? a : b).consume('concurrency-budget', { window: 60, max: 3 })));
    expect(attempts.filter(result => result.allowed)).toHaveLength(3);
    expect(await a.consume('concurrency-budget', { window: 60, max: 3 })).toEqual({ allowed: false, retryAfter: 60 });
    clock += 60_001;
    expect((await b.consume('concurrency-budget', { window: 60, max: 3 })).allowed).toBe(true);
    expect(await db.select().from(refreshLocks).where(eq(refreshLocks.id, 'source-test-lock'))).toHaveLength(1);
    const keys = await db.select({ id: refreshLocks.id }).from(refreshLocks).where(and(like(refreshLocks.id, 'auth-rate:%')));
    expect(keys.every(row => !row.id.includes('@') && !row.id.includes('concurrency-budget'))).toBe(true);
  });
});
