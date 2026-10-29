import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from 'better-auth/plugins';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { getDb, type Db } from "@/db/client";
import * as schema from "@/db/schema";
import { authRateLimit } from './auth-rate-limit';
import { isEmailLoginConfigured, sendLoginEmail } from './login-email';
import { isSameOrigin } from './access';

type LoginDeliveryContext = { loginEmailDelivery?: { attempted: boolean; sent: boolean } };

export function buildAuth(db: Db, env = process.env, deliver = sendLoginEmail) {
  const github =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
      : {};
  const email = isEmailLoginConfigured(env);
  const origins = [...new Set([env.BETTER_AUTH_URL, ...(env.AUTH_TRUSTED_ORIGINS || '').split(',')].filter((url): url is string => Boolean(url?.trim())).map(url => new URL(url.trim()).origin))];
  if (env.VERCEL_URL) origins.push(`https://${env.VERCEL_URL}`);
  const limiter = authRateLimit(db);
  return betterAuth({
    appName: 'Jarvis Reading',
    secret: env.BETTER_AUTH_SECRET,
    ...(origins.length ? { baseURL: { allowedHosts: origins.map(url => new URL(url).host), fallback: origins[0], protocol: env.NODE_ENV === 'production' ? 'https' as const : 'auto' as const }, trustedOrigins: origins } : {}),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    socialProviders: github,
    rateLimit: { enabled: true, window: 60, max: 20, customStorage: limiter, customRules: { '/get-session': false, '/sign-out': false } },
    disabledPaths: ['/email-otp/check-verification-otp', '/email-otp/get-verification-otp', '/email-otp/verify-email', '/email-otp/request-password-reset', '/email-otp/reset-password', '/forget-password/email-otp', '/email-otp/request-email-change', '/email-otp/change-email'],
    hooks: { before: createAuthMiddleware(async ctx => {
      if (ctx.path !== '/email-otp/send-verification-otp') return;
      if (ctx.request && !isSameOrigin(ctx.request)) throw new APIError('FORBIDDEN', { message: '请从本站发起登录。' });
      if (ctx.body?.type !== 'sign-in') throw new APIError('BAD_REQUEST', { message: '仅支持登录验证码。' });
      const address = typeof ctx.body.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
      if (!address || address.length > 320) throw new APIError('BAD_REQUEST', { message: '请填写有效邮箱。' });
      ctx.body.email = address;
      for (const [key, window, max] of [[`email-minute:${address}`, 60, 1], [`email-hour:${address}`, 3600, 3]] as const) {
        const limit = await limiter.consume(key, { window, max });
        if (!limit.allowed) throw new APIError('TOO_MANY_REQUESTS', { message: window === 60 ? '请等待 60 秒后再获取验证码。' : '该邮箱一小时最多发送 3 次，请稍后再试。' });
      }
      return { context: { context: { loginEmailDelivery: { attempted: false, sent: false } } } };
    }), after: createAuthMiddleware(async ctx => {
      if (ctx.path !== '/email-otp/send-verification-otp') return;
      const delivery = (ctx.context as LoginDeliveryContext).loginEmailDelivery;
      // Better Auth 会捕获发信回调的异常；显式确认投递 API 接受，避免误报“已发送”。
      if (delivery?.attempted && !delivery.sent) throw new APIError('SERVICE_UNAVAILABLE', { message: '验证码发送失败，请稍后重试。' });
    }) },
    plugins: [
      ...(email ? [emailOTP({ otpLength: 6, expiresIn: 300, allowedAttempts: 3, storeOTP: 'hashed', async sendVerificationOTP({ email, otp, type }, ctx) {
        if (type !== 'sign-in') throw new APIError('BAD_REQUEST', { message: '仅支持登录验证码。' });
        const delivery = (ctx?.context as LoginDeliveryContext).loginEmailDelivery;
        if (!delivery) throw new Error('Missing request-local delivery state');
        delivery.attempted = true;
        try { await deliver({ email, otp }); delivery.sent = true; }
        catch { delivery.sent = false; }
      } })] : []),
      nextCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof buildAuth>;
let shared: Promise<Auth> | undefined;

/** 数据库连接异步建立，所以 auth 实例也延迟创建并复用。 */
export function getAuth(): Promise<Auth> {
  shared ??= getDb().then(db => buildAuth(db));
  return shared;
}

export function isAuthConfigured(): boolean {
  return isEmailLoginConfigured() || Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function authMethods() {
  return { emailEnabled: isEmailLoginConfigured(), githubEnabled: Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET), githubLoginOrigin: process.env.BETTER_AUTH_URL };
}
