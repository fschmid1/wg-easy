import { describe, expect, test } from 'vitest';

import { databaseFixture } from '../helpers/database';

import { groupsFromClaims, readClaim } from '#server/features/identity/oauth';
import { isGrantExpired } from '#server/features/vpn/lifecycle';
import { parseDuration } from '#server/utils/config';

describe('group entitlement', () => {
  test('reads a flat claim', () => {
    expect(groupsFromClaims({ groups: ['vpn-users'] }, 'groups')).toEqual([
      'vpn-users',
    ]);
  });

  test('reads a dotted claim', () => {
    expect(
      groupsFromClaims(
        { realm_access: { roles: ['vpn-users', 'other'] } },
        'realm_access.roles'
      )
    ).toEqual(['vpn-users', 'other']);
  });

  test('a missing claim yields no groups', () => {
    expect(groupsFromClaims({}, 'groups')).toEqual([]);
    expect(readClaim({}, 'missing.path')).toBeUndefined();
  });

  test('non-string claim entries are ignored', () => {
    expect(
      groupsFromClaims({ groups: ['vpn-users', 7, null] }, 'groups')
    ).toEqual(['vpn-users']);
  });
});

describe('duration parsing', () => {
  test('parses units and bare seconds', () => {
    expect(parseDuration('X', '30s', 1)).toBe(30_000);
    expect(parseDuration('X', '10m', 1)).toBe(600_000);
    expect(parseDuration('X', '8h', 1)).toBe(28_800_000);
    expect(parseDuration('X', '45', 1)).toBe(45_000);
    expect(parseDuration('X', undefined, 7)).toBe(7);
  });

  test('rejects malformed values', () => {
    expect(() => parseDuration('X', 'soon', 1)).toThrow();
    expect(() => parseDuration('X', '-5m', 1)).toThrow();
  });
});

describe('grant deadlines', () => {
  const base = {
    createdAt: new Date('2026-01-01T10:00:00.000Z').toISOString(),
    expiresAt: new Date('2026-01-01T18:00:00.000Z').toISOString(),
    revealedAt: null,
    firstHandshakeAt: null,
  };

  test('a fresh grant is live', () => {
    expect(isGrantExpired(base, Date.parse('2026-01-01T10:00:01.000Z'))).toBe(
      false
    );
  });

  test('an undelivered grant dies with the download window', () => {
    expect(isGrantExpired(base, Date.parse('2026-01-01T10:10:01.000Z'))).toBe(
      true
    );
  });

  test('a delivered but unconnected grant dies with the connect deadline', () => {
    expect(
      isGrantExpired(
        { ...base, revealedAt: '2026-01-01T10:01:00.000Z' },
        Date.parse('2026-01-01T10:10:01.000Z')
      )
    ).toBe(true);
  });

  test('a connected grant lives until the hard lifetime', () => {
    const connected = {
      ...base,
      revealedAt: '2026-01-01T10:01:00.000Z',
      firstHandshakeAt: '2026-01-01T10:02:00.000Z',
    };
    expect(
      isGrantExpired(connected, Date.parse('2026-01-01T17:59:00.000Z'))
    ).toBe(false);
    expect(
      isGrantExpired(connected, Date.parse('2026-01-01T18:00:01.000Z'))
    ).toBe(true);
  });
});

describe('one-time reveal', () => {
  test('only the first claim wins and a released claim can be retried', async () => {
    const { store } = await databaseFixture();
    const [user] = await store.users.insert({
      username: 'alice',
      password: null,
      email: 'alice@example.com',
      name: 'Alice',
      role: 2,
      totpVerified: false,
      enabled: true,
      oauthProvider: 'oidc',
      oauthId: 'sub-alice',
    });
    const [grant] = await store.clients.insert({
      userId: user!.id,
      sessionId: 'session-a',
      interfaceId: 'wg0',
      name: 'Firefox · Linux',
      ipv4Address: '10.8.0.2',
      ipv6Address: 'fdcc:ad94:bacf:61a4::cafe:2',
      privateKey: 'private',
      publicKey: 'public',
      serverAllowedIps: [],
      persistentKeepalive: 25,
      enabled: true,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const id = grant!.clientId;
    const at = new Date().toISOString();

    expect(await store.clients.claimReveal(id, at)).toBe(true);
    expect(await store.clients.claimReveal(id, at)).toBe(false);

    await store.clients.releaseReveal(id, at);
    expect(await store.clients.claimReveal(id, at)).toBe(true);

    await store.clients.burnPrivateKey(id);
    expect((await store.clients.get(id))?.privateKey).toBe('');
    await store.clients.releaseReveal(id, at);
    expect(await store.clients.claimReveal(id, at)).toBe(false);
  });
});

describe('sessions', () => {
  test('revoked and expired sessions are rejected and cleaned up', async () => {
    const { store } = await databaseFixture();
    const [user] = await store.users.insert({
      username: 'bob',
      password: null,
      email: 'bob@example.com',
      name: 'Bob',
      role: 2,
      totpVerified: false,
      enabled: true,
      oauthProvider: 'oidc',
      oauthId: 'sub-bob',
    });

    await store.sessions.create(
      'live-hash',
      user!.id,
      new Date(Date.now() + 3_600_000).toISOString()
    );
    expect(await store.sessions.get('live-hash')).toMatchObject({
      userId: user!.id,
      revokedAt: null,
    });

    await store.sessions.revoke('live-hash');
    expect((await store.sessions.get('live-hash'))?.revokedAt).not.toBeNull();

    await store.sessions.create(
      'expired-hash',
      user!.id,
      new Date(Date.now() - 1000).toISOString()
    );
    await store.sessions.deleteExpired(new Date().toISOString());
    expect(await store.sessions.get('expired-hash')).toBeUndefined();
  });
});
