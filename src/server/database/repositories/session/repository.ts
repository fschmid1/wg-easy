import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import { session } from './schema';

import type { DBExecutor } from '#db/types';

export class SessionRepository {
  constructor(private readonly db: DBExecutor) {}

  async create(id: string, userId: number, expiresAt: string) {
    const now = new Date().toISOString();
    await this.db.insert(session).values({
      id,
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
    });
  }

  async get(id: string) {
    return this.db.query.session.findFirst({ where: eq(session.id, id) });
  }

  async touch(id: string, lastSeenAt: string) {
    await this.db.update(session).set({ lastSeenAt }).where(eq(session.id, id));
  }

  async revoke(id: string) {
    await this.db
      .update(session)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(session.id, id), isNull(session.revokedAt)));
  }

  async deleteExpired(now: string) {
    await this.db
      .delete(session)
      .where(
        or(
          isNotNull(session.revokedAt),
          lt(sql`julianday(${session.expiresAt})`, sql`julianday(${now})`)
        )
      );
  }
}
