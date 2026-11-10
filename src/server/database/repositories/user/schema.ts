import { sql, relations } from 'drizzle-orm';
import { int, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { client } from '../client/schema';

export const user = sqliteTable(
  'users_table',
  {
    id: int().primaryKey({ autoIncrement: true }),
    username: text().notNull().unique(),
    /** `password == null` means password login disabled */
    password: text(),
    email: text().unique(),
    name: text().notNull(),
    /** Legacy column kept for migration compatibility; unused by the portal. */
    role: int().notNull(),
    totpKey: text('totp_key'),
    totpVerified: int('totp_verified', { mode: 'boolean' }).notNull(),
    enabled: int({ mode: 'boolean' }).notNull(),
    oauthProvider: text('oauth_provider'),
    oauthId: text('oauth_id'),
    /** Sliding hourly bucket for config issuance. */
    grantIssuedCount: int('grant_issued_count').notNull().default(0),
    grantWindowStart: text('grant_window_start'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`)
      .$onUpdate(() => sql`(CURRENT_TIMESTAMP)`),
  },
  (table) => [
    uniqueIndex('oauth_provider_id_unique').on(
      table.oauthProvider,
      table.oauthId
    ),
  ]
);

export const usersRelations = relations(user, ({ many }) => ({
  clients: many(client),
}));
