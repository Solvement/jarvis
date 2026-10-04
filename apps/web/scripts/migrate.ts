// 部署构建前应用数据库迁移。没有 DATABASE_URL（本地/CI 构建）时跳过：本地 PGlite 在首次连接时自动迁移。
// Neon 的 Vercel 集成给每个 preview 部署一个独立分支，所以 preview 构建不会改动生产库。
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("[migrate] 未设置 DATABASE_URL，跳过。");
} else {
  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: "./db/migrations" });
  await pool.end();
  console.log("[migrate] 完成。");
}
