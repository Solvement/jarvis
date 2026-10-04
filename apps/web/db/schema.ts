import { pgTable, text, timestamp, boolean, jsonb, bigint, index, primaryKey } from "drizzle-orm/pg-core";

// ---- 内容 ----

/** 每次抓取一份榜单快照；同一榜单按 fetched_at 取最新。失败也留记录（payload.stale=true）。 */
export const snapshots = pgTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    board: text("board").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("snapshots_board_fetched_idx").on(t.board, t.fetchedAt)],
);

/** 阅读版本只追加。visibility=draft 只有作者可见（D-007）。 */
export const readings = pgTable(
  "readings",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull(),
    sourceHash: text("source_hash").notNull(),
    level: text("level").notNull(),
    visibility: text("visibility").notNull().default("public"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").notNull(),
  },
  (t) => [index("readings_item_idx").on(t.itemId), index("readings_generated_idx").on(t.generatedAt)],
);

export const refreshLocks = pgTable("refresh_locks", {
  id: text("id").primaryKey(),
  expires: bigint("expires", { mode: "number" }).notNull(),
});

// ---- 个人状态 ----

/** 每个用户对每个条目的已读、收藏、笔记。只由用户本人显式写入。 */
export const itemStates = pgTable(
  "item_states",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    starred: boolean("starred").notNull().default(false),
    note: text("note").notNull().default(""),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

// ---- Better Auth 核心表（字段与 better-auth 1.7 getAuthTables 一致） ----

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
