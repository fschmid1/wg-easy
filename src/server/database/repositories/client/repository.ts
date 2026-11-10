import { eq, and, isNull, isNotNull, sql, inArray, lte } from 'drizzle-orm';

import { client } from './schema';

import type { DBExecutor } from '#db/types';

/**
 * The legacy `clients_table` is reused as the grant table: a row is one live
 * WireGuard peer owned by one web session. Revocation deletes the row, so
 * anything returned here is live until explicitly removed.
 */
export class ClientRepository {
  constructor(private readonly db: DBExecutor) {}

  /** Includes WireGuard secrets; only the lifecycle and reveal paths use this. */
  async getAll() {
    return this.db.query.client.findMany();
  }

  async getForUser(userId: number) {
    return this.db.query.client.findMany({
      where: eq(client.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    });
  }

  async getBySession(sessionId: string) {
    return this.db.query.client.findFirst({
      where: eq(client.sessionId, sessionId),
    });
  }

  async countForUser(userId: number) {
    return this.db.$count(client, eq(client.userId, userId));
  }

  async countCreatedSince(userId: number, since: string) {
    return this.db.$count(
      client,
      and(
        eq(client.userId, userId),
        sql`julianday(${client.createdAt}) >= julianday(${since})`
      )
    );
  }

  async oldestForUser(userId: number) {
    return this.db.query.client.findFirst({
      where: eq(client.userId, userId),
      orderBy: (t, { asc }) => asc(t.id),
    });
  }

  async get(id: number) {
    return this.db.query.client.findFirst({ where: eq(client.id, id) });
  }

  async insert(data: typeof client.$inferInsert) {
    return this.db
      .insert(client)
      .values(data)
      .returning({ clientId: client.id });
  }

  async update(id: number, data: Partial<typeof client.$inferInsert>) {
    return this.db.update(client).set(data).where(eq(client.id, id));
  }

  async delete(id: number) {
    return this.db.delete(client).where(eq(client.id, id));
  }

  async deleteMany(ids: number[]) {
    if (ids.length === 0) {
      return;
    }
    return this.db.delete(client).where(inArray(client.id, ids));
  }

  async deleteBySession(sessionId: string) {
    return this.db.delete(client).where(eq(client.sessionId, sessionId));
  }

  /** Atomically claims the single reveal slot. Returns false if already used. */
  async claimReveal(id: number, at: string) {
    const result = await this.db
      .update(client)
      .set({ revealedAt: at })
      .where(
        and(
          eq(client.id, id),
          isNull(client.revealedAt),
          sql`${client.privateKey} <> ''`
        )
      )
      .returning({ id: client.id });
    return result.length > 0;
  }

  /** Rolls a claim back if the response never completed. */
  async releaseReveal(id: number, at: string) {
    await this.db
      .update(client)
      .set({ revealedAt: null })
      .where(and(eq(client.id, id), eq(client.revealedAt, at)));
  }

  async burnPrivateKey(id: number) {
    await this.db
      .update(client)
      .set({ privateKey: '' })
      .where(eq(client.id, id));
  }

  async setFirstHandshake(id: number, at: string) {
    await this.db
      .update(client)
      .set({ firstHandshakeAt: at })
      .where(and(eq(client.id, id), isNull(client.firstHandshakeAt)));
  }

  /** Grants whose hard lifetime has passed. */
  async getExpired(now: string) {
    return this.db.query.client.findMany({
      where: lte(sql`julianday(${client.expiresAt})`, sql`julianday(${now})`),
    });
  }

  /** Grants whose one-time reveal was claimed but never completed. */
  async getStuckReveals(now: number) {
    const cutoff = new Date(now - 60_000).toISOString();
    return this.db.query.client.findMany({
      where: and(
        isNotNull(client.revealedAt),
        sql`${client.privateKey} <> ''`,
        lte(sql`julianday(${client.revealedAt})`, sql`julianday(${cutoff})`)
      ),
    });
  }
}
