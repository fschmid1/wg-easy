import { createError } from 'nuxt/server';
import { parseCidr } from 'cidr-tools';

import { commit } from './lifecycle';
import { generateClientConfig } from './configuration';

import { wg } from '#server/utils/wgHelper';
import { getDatabase } from '#db';
import { GRANT_ENV, VPN_ENV, WG_ENV } from '#server/utils/config';
import { nextIP } from '#server/utils/ip';
import type { ClientType } from '#db/repositories/client/types';
import type {
  GrantState,
  GrantSummary,
  PortalUser,
} from '#shared/contracts/identity';

const RATE_WINDOW = 60 * 60_000;

function issuedAt(grant: ClientType) {
  return Date.parse(grant.createdAt);
}

function stateOf(grant: ClientType): GrantState {
  if (grant.firstHandshakeAt) {
    return 'connected';
  }
  return grant.revealedAt ? 'delivered' : 'issued';
}

function summary(
  grant: ClientType,
  currentSessionId: string | undefined
): GrantSummary {
  const issued = issuedAt(grant);
  return {
    id: grant.id,
    name: grant.name,
    state: stateOf(grant),
    ipv4Address: grant.ipv4Address,
    ipv6Address: WG_ENV.DISABLE_IPV6 ? null : grant.ipv6Address,
    createdAt: grant.createdAt,
    downloadDeadline: issued + GRANT_ENV.DOWNLOAD_WINDOW,
    connectDeadline: issued + GRANT_ENV.CONNECT_DEADLINE,
    expiresAt: Date.parse(grant.expiresAt ?? '')
      ? Date.parse(grant.expiresAt!)
      : issued + GRANT_ENV.MAX_LIFETIME,
    revealed: grant.revealedAt !== null,
    connected: grant.firstHandshakeAt !== null,
    currentSession: grant.sessionId === currentSessionId,
  };
}

export async function listGrants(
  user: PortalUser,
  currentSessionId: string | undefined
) {
  const grants = await getDatabase().clients.getForUser(user.id);
  return {
    grantsAllowed: GRANT_ENV.MAX_PER_USER,
    grants: grants
      .sort((a, b) => b.id - a.id)
      .map((grant) => summary(grant, currentSessionId)),
  };
}

/** Keeps the per-user live grant count under the configured cap. */
export function enforceCap(userId: number) {
  return commit(async (tx) => {
    while ((await tx.clients.countForUser(userId)) >= GRANT_ENV.MAX_PER_USER) {
      const oldest = await tx.clients.oldestForUser(userId);
      if (!oldest) {
        break;
      }
      await tx.clients.delete(oldest.id);
      if (oldest.sessionId) {
        await tx.sessions.revoke(oldest.sessionId);
      }
    }
  });
}

function deviceName(userAgent: string | null) {
  if (!userAgent) {
    return `Grant ${new Date().toISOString().slice(0, 16)}`;
  }
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'Browser';
  const system = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/.test(userAgent)
        ? 'iOS'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : 'Unknown';
  return `${browser} · ${system}`;
}

export async function issueGrant(
  user: PortalUser,
  sessionId: string,
  userAgent: string | null
) {
  const privateKey = await wg.generatePrivateKey();
  const publicKey = await wg.getPublicKey(privateKey);
  const preSharedKey = await wg.generatePreSharedKey();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const created = await commit(async (tx) => {
    const account = await tx.users.get(user.id);
    if (!account) {
      throw createError({ status: 401, statusText: 'Not authenticated' });
    }
    const windowStart = account.grantWindowStart
      ? Date.parse(account.grantWindowStart)
      : 0;
    const inWindow = now - windowStart < RATE_WINDOW;
    const issued = inWindow ? account.grantIssuedCount : 0;
    if (issued >= GRANT_ENV.REISSUE_PER_HOUR) {
      throw createError({
        status: 429,
        statusText: 'Too many configs issued. Try again later.',
      });
    }
    await tx.users.update(user.id, {
      grantIssuedCount: issued + 1,
      grantWindowStart: inWindow
        ? (account.grantWindowStart ?? nowIso)
        : nowIso,
    });

    // One live grant per session: re-issuing replaces the previous one.
    await tx.clients.deleteBySession(sessionId);
    while ((await tx.clients.countForUser(user.id)) >= GRANT_ENV.MAX_PER_USER) {
      const oldest = await tx.clients.oldestForUser(user.id);
      if (!oldest) {
        break;
      }
      await tx.clients.delete(oldest.id);
      if (oldest.sessionId) {
        await tx.sessions.revoke(oldest.sessionId);
      }
    }

    const network = await tx.interfaces.get();
    const clients = await tx.clients.getAll();
    const [row] = await tx.clients.insert({
      userId: user.id,
      sessionId,
      interfaceId: network.name,
      name: deviceName(userAgent),
      ipv4Address: nextIP(parseCidr(network.ipv4Cidr), clients),
      ipv6Address: nextIP(parseCidr(network.ipv6Cidr), clients),
      privateKey,
      publicKey,
      preSharedKey: preSharedKey || null,
      serverAllowedIps: [],
      persistentKeepalive: VPN_ENV.KEEPALIVE,
      mtu: VPN_ENV.MTU,
      dns: VPN_ENV.DNS,
      allowedIps: VPN_ENV.ALLOWED_IPS,
      expiresAt: new Date(now + GRANT_ENV.MAX_LIFETIME).toISOString(),
      createdAt: nowIso,
      enabled: true,
    });
    return row!.clientId;
  });

  const grant = await getDatabase().clients.get(created);
  if (!grant) {
    throw new Error('Grant disappeared after creation');
  }
  return summary(grant, sessionId);
}

function filename(name: string, id: number) {
  const clean = name
    .replace(/[^a-zA-Z0-9_=+.-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/-$/, '')
    .substring(0, 32);
  return `${clean || id}.conf`;
}

export type Reveal = {
  id: number;
  filename: string;
  contents: string;
  claimedAt: string;
};

/**
 * Atomically claims the single reveal slot and returns the config. The caller
 * must call {@link burnPrivateKey} after a completed response, or
 * {@link releaseReveal} when the transfer aborted.
 */
export async function beginReveal(
  user: PortalUser,
  id: number
): Promise<Reveal> {
  const now = Date.now();
  const claimedAt = new Date(now).toISOString();
  const data = await getDatabase().transaction(async (tx) => {
    const grant = await tx.clients.get(id);
    if (!grant || grant.userId !== user.id) {
      throw createError({ status: 404, statusText: 'Grant not found' });
    }
    if (grant.revealedAt) {
      throw createError({
        status: 409,
        statusText: 'Config already delivered',
      });
    }
    if (!grant.privateKey) {
      throw createError({
        status: 410,
        statusText: 'Config already delivered',
      });
    }
    if (now >= issuedAt(grant) + GRANT_ENV.DOWNLOAD_WINDOW) {
      throw createError({
        status: 410,
        statusText: 'Download window has expired',
      });
    }
    if (!(await tx.clients.claimReveal(id, claimedAt))) {
      throw createError({
        status: 409,
        statusText: 'Config already delivered',
      });
    }
    const network = await tx.interfaces.get();
    const defaults = await tx.userConfigs.get();
    return {
      filename: filename(grant.name, grant.id),
      contents: generateClientConfig(network, defaults, grant, {
        enableIpv6: !WG_ENV.DISABLE_IPV6,
        amnezia: WG_ENV.WG_EXECUTABLE === 'awg',
      }),
    };
  });
  return { id, claimedAt, ...data };
}

export async function burnPrivateKey(id: number) {
  await getDatabase().clients.burnPrivateKey(id);
}

export async function releaseReveal(id: number, claimedAt: string) {
  await getDatabase().clients.releaseReveal(id, claimedAt);
}

export function revokeGrant(user: PortalUser, id: number) {
  return commit(async (tx) => {
    const grant = await tx.clients.get(id);
    if (!grant || grant.userId !== user.id) {
      throw createError({ status: 404, statusText: 'Grant not found' });
    }
    await tx.clients.delete(id);
  });
}

export function revokeSessionGrants(sessionId: string) {
  return commit(async (tx) => {
    await tx.clients.deleteBySession(sessionId);
  });
}
