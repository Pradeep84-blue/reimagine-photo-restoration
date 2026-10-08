import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** App-owned users. openId is a Reimagine identity, not a Manus OAuth id. */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }).default("email"),
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    sessionVersion: int("sessionVersion").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => ({ emailUnique: uniqueIndex("users_email_unique").on(table.email) })
);

/** Password hashes never leave this server-owned table. */
export const passwordCredentials = mysqlTable(
  "password_credentials",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    salt: varchar("salt", { length: 32 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userUnique: uniqueIndex("password_credentials_user_unique").on(
      table.userId
    ),
  })
);

/** Object keys are internal only; public API responses never include them. */
export const photoHistory = mysqlTable(
  "photo_history",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: varchar("batchId", { length: 36 }),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    style: mysqlEnum("style", ["natural", "vivid"])
      .default("natural")
      .notNull(),
    originalPath: varchar("originalPath", { length: 512 }).notNull(),
    originalMimeType: varchar("originalMimeType", { length: 32 }).notNull(),
    resultPath: varchar("resultPath", { length: 512 }).notNull(),
    resultMimeType: varchar("resultMimeType", { length: 32 }).notNull(),
    favorite: boolean("favorite").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    removedAt: timestamp("removedAt"),
  },
  table => ({
    ownerCreated: index("photo_history_owner_created_idx").on(
      table.userId,
      table.createdAt
    ),
    ownerRemoved: index("photo_history_owner_removed_idx").on(
      table.userId,
      table.removedAt
    ),
    ownerBatch: index("photo_history_owner_batch_idx").on(
      table.userId,
      table.batchId
    ),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type PasswordCredential = typeof passwordCredentials.$inferSelect;
export type PhotoHistory = typeof photoHistory.$inferSelect;
export type ColorStyle = PhotoHistory["style"];
