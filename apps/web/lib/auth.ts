import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb, type Db } from "@/db/client";
import * as schema from "@/db/schema";

function build(db: Db) {
  const github =
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } }
      : {};
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    socialProviders: github,
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof build>;
let shared: Promise<Auth> | undefined;

/** 数据库连接异步建立，所以 auth 实例也延迟创建并复用。 */
export function getAuth(): Promise<Auth> {
  shared ??= getDb().then(build);
  return shared;
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}
