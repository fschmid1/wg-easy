import { sql } from 'drizzle-orm';
import { int, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

import { user } from '../user/schema';

export const session = sqliteTable(
  'sessions_table',
  {
    /** SHA-256 hash of the opaque cookie token. */
    id: text().primaryKey(),
    userId: int('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    lastSeenAt: text('last_seen_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
  },
  (table) => [index('sessions_user_idx').on(table.userId)]
);

export type SessionType = typeof session.$inferSelect;
