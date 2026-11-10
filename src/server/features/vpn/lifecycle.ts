import fs from 'node:fs/promises';

import { generateServerConfig } from './configuration';

import { getDatabase } from '#db';
import type { DatabaseStore, Repositories } from '#db/store';
import { wg } from '#server/utils/wgHelper';
import { firewall } from '#server/utils/firewall';
import {
  GRANT_ENV,
  HOOKS_ENV,
  SESSION_ENV,
  VPN_ENV,
  WG_ENV,
} from '#server/utils/config';

let pending: Promise<unknown> = Promise.resolve();
type ApplyMode = 'sync' | 'start' | 'restart';
const unapplied = new WeakMap<DatabaseStore, ApplyMode>();

/** Each caller waits for its own update; a failure must not block later updates. */
function enqueue<T>(operation: () => Promise<T>) {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}

async function apply(mode?: ApplyMode) {
  const database = getDatabase();
  mode ??= unapplied.get(database) ?? 'sync';
  // Clear only after every host effect succeeds. Maintenance retries failures.
  unapplied.set(database, mode);
  const { network, clients, hooks, defaults } = await database.transaction(
    async (tx) => ({
      network: await tx.interfaces.get(),
      clients: await tx.clients.getAll(),
      hooks: await tx.hooks.get(),
      defaults: await tx.userConfigs.get(),
    })
  );
  const enableIpv6 = !WG_ENV.DISABLE_IPV6;
  if (network.firewallEnabled) {
    await firewall.blockTraffic(network.name, enableIpv6);
  }

  if (mode === 'sync') {
    // Remove revoked peers before parsing or applying the full configuration.
    // An unrelated invalid or unresolvable endpoint must not preserve access.
    const enabledKeys = new Set(
      clients
        .filter((client) => client.enabled)
        .map((client) => client.publicKey)
    );
    for (const peer of await wg.dump(network.name)) {
      if (!enabledKeys.has(peer.publicKey)) {
        await wg.removePeer(network.name, peer.publicKey);
      }
    }
  }
  const contents = generateServerConfig(network, hooks, clients, {
    enableIpv6,
    amnezia: WG_ENV.WG_EXECUTABLE === 'awg',
    uiPort: WG_ENV.PORT,
  });

  await fs.writeFile(`/etc/wireguard/${network.name}.conf`, contents, {
    mode: 0o600,
  });
  if (mode === 'start') {
    await wg.down(network.name).catch(() => {});
    try {
      await wg.up(network.name);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(`Cannot find device "${network.name}"`)
      ) {
        throw new Error(
          `WireGuard exited with the error: Cannot find device "${network.name}"\nThis usually means that your host's kernel does not support WireGuard!`,
          { cause: error }
        );
      }
      throw error;
    }
  } else if (mode === 'restart') {
    await wg.restart(network.name);
  }
  await wg.sync(network.name);
  await firewall.rebuildRules(network, clients, defaults, enableIpv6);
  unapplied.delete(database);
}

/** Commit first; a host failure leaves saved state available for a later retry. */
export function commit<T>(
  change: (tx: Repositories) => Promise<T>,
  mode?: ApplyMode
) {
  return enqueue(async () => {
    const result = await getDatabase().transaction(change);
    await apply(mode);
    return result;
  });
}

export function isGrantExpired(
  grant: {
    createdAt: string;
    expiresAt: string | null;
    revealedAt: string | null;
    firstHandshakeAt: string | null;
  },
  now: number
) {
  const issued = Date.parse(grant.createdAt);
  if (now >= issued + GRANT_ENV.CONNECT_DEADLINE && !grant.firstHandshakeAt) {
    return true;
  }
  if (now >= issued + GRANT_ENV.DOWNLOAD_WINDOW && !grant.revealedAt) {
    return true;
  }
  if (grant.expiresAt && now >= Date.parse(grant.expiresAt)) {
    return true;
  }
  if (
    GRANT_ENV.IDLE_TIMEOUT > 0 &&
    grant.firstHandshakeAt &&
    now - Date.parse(grant.firstHandshakeAt) >= GRANT_ENV.IDLE_TIMEOUT
  ) {
    return true;
  }
  return false;
}

/** A grant never outlives the web session that owns it. */
async function hasLiveSession(
  tx: Repositories,
  sessionId: string | null,
  now: number
) {
  if (!sessionId) {
    return false;
  }
  const row = await tx.sessions.get(sessionId);
  return Boolean(
    row &&
    !row.revokedAt &&
    now < Date.parse(row.expiresAt) &&
    now - Date.parse(row.lastSeenAt) <= SESSION_ENV.IDLE
  );
}

/**
 * Revokes timed-out grants and records the first observed handshake.
 * Safe to run before the interface exists; handshake polling is best effort.
 */
export function maintain() {
  return enqueue(async () => {
    const database = getDatabase();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const network = await database.interfaces.get();

    const connected = new Set<string>();
    try {
      for (const peer of await wg.dump(network.name)) {
        if (peer.latestHandshakeAt) {
          connected.add(peer.publicKey);
        }
      }
    } catch {
      // The interface may be down; timers still apply.
    }

    const changed = await database.transaction(async (tx) => {
      let removed = false;
      for (const grant of await tx.clients.getAll()) {
        if (!grant.firstHandshakeAt && connected.has(grant.publicKey)) {
          await tx.clients.setFirstHandshake(grant.id, nowIso);
          grant.firstHandshakeAt = nowIso;
        }
        if (
          isGrantExpired(grant, now) ||
          !(await hasLiveSession(tx, grant.sessionId, now))
        ) {
          await tx.clients.delete(grant.id);
          removed = true;
        }
      }
      for (const stuck of await tx.clients.getStuckReveals(now)) {
        await tx.clients.burnPrivateKey(stuck.id);
      }
      await tx.sessions.deleteExpired(nowIso);
      return removed;
    });
    if (changed || unapplied.has(database)) {
      await apply();
    }
  });
}

export function restart() {
  return enqueue(() => apply('restart'));
}

/** Runs before the interface is brought up. */
export async function reconcile() {
  const database = getDatabase();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const legacy = (await database.clients.getAll()).filter(
    (client) => !client.sessionId
  );
  if (legacy.length > 0 && !WG_ENV.PORTAL_WIPE_LEGACY) {
    throw new Error(
      `Found ${legacy.length} long-lived client(s) from the previous install. This build is an OIDC access portal and cannot manage them. Start once with PORTAL_WIPE_LEGACY=1 to destroy them.`
    );
  }
  await database.transaction(async (tx) => {
    if (legacy.length > 0) {
      await tx.clients.deleteMany(legacy.map((client) => client.id));
      await tx.users.deleteNonOidc();
    }
    const network = await tx.interfaces.get();
    if (
      network.ipv4Cidr !== VPN_ENV.IPV4_CIDR ||
      network.ipv6Cidr !== VPN_ENV.IPV6_CIDR
    ) {
      // Existing peer addresses belong to the old subnet; fail closed.
      const stale = await tx.clients.getAll();
      await tx.clients.deleteMany(stale.map((client) => client.id));
    }
    for (const grant of await tx.clients.getAll()) {
      if (
        isGrantExpired(grant, now) ||
        !(await hasLiveSession(tx, grant.sessionId, now))
      ) {
        await tx.clients.delete(grant.id);
      }
    }
    for (const stuck of await tx.clients.getStuckReveals(now)) {
      await tx.clients.burnPrivateKey(stuck.id);
    }
    await tx.sessions.deleteExpired(nowIso);
    // Environment is the source of truth for generated defaults.
    await tx.interfaces.update({
      port: VPN_ENV.PORT,
      ipv4Cidr: VPN_ENV.IPV4_CIDR,
      ipv6Cidr: VPN_ENV.IPV6_CIDR,
    });
    await tx.userConfigs.update({
      host: VPN_ENV.HOST,
      port: VPN_ENV.PORT,
      defaultDns: VPN_ENV.DNS,
      defaultAllowedIps: VPN_ENV.ALLOWED_IPS,
      defaultMtu: VPN_ENV.MTU,
      defaultPersistentKeepalive: VPN_ENV.KEEPALIVE,
      defaultGeneratePreSharedKey: true,
    });
    // An empty update object makes Drizzle throw, so only write overrides.
    if (
      HOOKS_ENV.PRE_UP !== undefined ||
      HOOKS_ENV.POST_UP !== undefined ||
      HOOKS_ENV.PRE_DOWN !== undefined ||
      HOOKS_ENV.POST_DOWN !== undefined
    ) {
      await tx.hooks.update({
        ...(HOOKS_ENV.PRE_UP !== undefined && { preUp: HOOKS_ENV.PRE_UP }),
        ...(HOOKS_ENV.POST_UP !== undefined && { postUp: HOOKS_ENV.POST_UP }),
        ...(HOOKS_ENV.PRE_DOWN !== undefined && {
          preDown: HOOKS_ENV.PRE_DOWN,
        }),
        ...(HOOKS_ENV.POST_DOWN !== undefined && {
          postDown: HOOKS_ENV.POST_DOWN,
        }),
      });
    }
  });
}

export function start() {
  return enqueue(async () => {
    const { interfaces } = getDatabase();
    let network = await interfaces.get();
    if (
      network.privateKey === '---default---' &&
      network.publicKey === '---default---'
    ) {
      const privateKey = await wg.generatePrivateKey();
      await interfaces.update({
        privateKey,
        publicKey: await wg.getPublicKey(privateKey),
      });
      network = await interfaces.get();
    }
    if (network.h1 === '0') {
      const headers = new Set<number>();
      while (headers.size < 4) {
        headers.add(Math.floor(Math.random() * 2147483642) + 5);
      }
      const [h1, h2, h3, h4] = [...headers].map(String);
      await interfaces.update({
        h1: h1!,
        h2: h2!,
        h3: h3!,
        h4: h4!,
      });
    }
    if (
      network.firewallEnabled &&
      !(await firewall.isAvailable(!WG_ENV.DISABLE_IPV6))
    ) {
      const tools = WG_ENV.DISABLE_IPV6 ? 'iptables' : 'iptables/ip6tables';
      throw new Error(
        `Per-Client Firewall is enabled but ${tools} is not available. Refusing to start the VPN. Please install ${tools} to use this feature.`
      );
    }
    await apply('start');
  });
}

export function stop() {
  return enqueue(async () => {
    const database = getDatabase();
    const network = await database.interfaces.get();
    await wg.down(network.name).catch(() => {});
    unapplied.delete(database);
  });
}
