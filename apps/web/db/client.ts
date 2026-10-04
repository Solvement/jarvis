import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

/** 生产用 Neon，本地开发与测试用 PGlite；业务代码只依赖这个公共类型。 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = "./db/migrations";

/** 内存或目录型 PGlite，并应用全部迁移。测试每个用例新建一个。 */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as Db;
}

export async function createNeonDb(url: string): Promise<Db> {
  const { Pool } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  return drizzle(new Pool({ connectionString: url }), { schema }) as unknown as Db;
}

let shared: Promise<Db> | undefined;

/** 进程内复用一个连接。没有 DATABASE_URL 时落到本地 .pglite/（仅开发）。 */
export function getDb(): Promise<Db> {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (url) shared = createNeonDb(url);
    else if (process.env.NODE_ENV === "production") throw new Error("缺少 DATABASE_URL");
    else shared = createPgliteDb(".pglite");
  }
  return shared;
}
