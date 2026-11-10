import { createDebug } from 'obug';
import { parseCidr } from 'cidr-tools';
import packageJson from '@@/package.json';

import { exec } from '#server/utils/cmd';
import { parseInterfaceName } from '#server/utils/interfaceName';
import { parseTrustedProxies } from '#server/utils/trustedProxy';

export const RELEASE = 'v' + packageJson.version;

export const SERVER_DEBUG = createDebug('Server');

const detectAwg = async (): Promise<'awg' | 'wg'> => {
  /** TODO: delete on next major version */
  if (process.env.EXPERIMENTAL_AWG === 'true') {
    const OVERRIDE_AUTO_AWG = process.env.OVERRIDE_AUTO_AWG?.toLowerCase();

    if (
      OVERRIDE_AUTO_AWG === ('wg' as const) ||
      OVERRIDE_AUTO_AWG === ('awg' as const)
    ) {
      return OVERRIDE_AUTO_AWG;
    } else {
      return await exec('modinfo amneziawg')
        .then(() => 'awg' as const)
        .catch(() => 'wg' as const);
    }
  } else {
    return 'wg';
  }
};

function list(value: string | undefined) {
  return value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function integer(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

function cidr(name: string, value: string | undefined, fallback: string) {
  const parsed = value ?? fallback;
  try {
    parseCidr(parsed);
  } catch {
    throw new Error(`Invalid CIDR for ${name}: ${parsed}`);
  }
  return parsed;
}

/**
 * Parses a duration such as `30s`, `10m`, `8h` or a plain number of seconds.
 */
export function parseDuration(
  name: string,
  value: string | undefined,
  fallback: number
) {
  if (!value) {
    return fallback;
  }
  const match = /^(\d+)(s|m|h)?$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration for ${name}: ${value}`);
  }
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2] ?? 's';
  const multiplier = unit === 'h' ? 3_600_000 : unit === 'm' ? 60_000 : 1_000;
  return amount * multiplier;
}

export const OIDC_ENV = {
  /** Display name of the only supported identity provider. */
  NAME: process.env.OAUTH_OIDC_NAME ?? 'OIDC',
  SERVER: process.env.OAUTH_OIDC_SERVER ?? '',
  CLIENT_ID: process.env.OAUTH_OIDC_CLIENT_ID,
  CLIENT_SECRET: process.env.OAUTH_OIDC_CLIENT_SECRET,
  /** Requested scopes; must include whatever scope carries the group claim. */
  SCOPES: (process.env.OIDC_SCOPES ?? 'openid email profile groups').split(' '),
  /** Dotted path to the group claim in the userinfo response. */
  GROUPS_CLAIM: process.env.OIDC_GROUPS_CLAIM ?? 'groups',
  /** Members of any of these groups may use the portal. */
  ALLOWED_GROUPS: list(process.env.OIDC_ALLOWED_GROUPS) ?? [],
  /** Optional additional gate on the email domain. */
  ALLOWED_DOMAINS: list(process.env.OAUTH_ALLOWED_DOMAINS) ?? [],
};

export function assertOidcConfigured() {
  if (!OIDC_ENV.SERVER || !OIDC_ENV.CLIENT_ID || !OIDC_ENV.CLIENT_SECRET) {
    throw new Error(
      'This build is an OIDC-only access portal. Set OAUTH_OIDC_SERVER, OAUTH_OIDC_CLIENT_ID and OAUTH_OIDC_CLIENT_SECRET.'
    );
  }
  if (OIDC_ENV.ALLOWED_GROUPS.length === 0) {
    throw new Error(
      'Set OIDC_ALLOWED_GROUPS to the group(s) allowed to request VPN access.'
    );
  }
}

export const VPN_ENV = {
  HOST: process.env.VPN_HOST ?? '',
  PORT: integer(process.env.VPN_PORT, 51820),
  DNS: list(process.env.VPN_DNS) ?? ['1.1.1.1', '2606:4700:4700::1111'],
  MTU: integer(process.env.VPN_MTU, 1300),
  KEEPALIVE: integer(process.env.VPN_KEEPALIVE, 25),
  ALLOWED_IPS: list(process.env.VPN_ALLOWED_IPS) ?? ['0.0.0.0/0', '::/0'],
  IPV4_CIDR: cidr('VPN_IPV4_CIDR', process.env.VPN_IPV4_CIDR, '10.8.0.0/24'),
  IPV6_CIDR: cidr(
    'VPN_IPV6_CIDR',
    process.env.VPN_IPV6_CIDR,
    'fdcc:ad94:bacf:61a4::cafe:0/112'
  ),
  IPV6_ENABLED:
    process.env.VPN_IPV6_ENABLED !== 'false' &&
    process.env.DISABLE_IPV6 !== 'true',
};

export const GRANT_ENV = {
  DOWNLOAD_WINDOW: parseDuration(
    'GRANT_DOWNLOAD_WINDOW',
    process.env.GRANT_DOWNLOAD_WINDOW,
    10 * 60_000
  ),
  CONNECT_DEADLINE: parseDuration(
    'GRANT_CONNECT_DEADLINE',
    process.env.GRANT_CONNECT_DEADLINE,
    10 * 60_000
  ),
  MAX_LIFETIME: parseDuration(
    'GRANT_MAX_LIFETIME',
    process.env.GRANT_MAX_LIFETIME,
    8 * 60 * 60_000
  ),
  /** Idle timeout is disabled unless a non-zero duration is configured. */
  IDLE_TIMEOUT: parseDuration(
    'GRANT_IDLE_TIMEOUT',
    process.env.GRANT_IDLE_TIMEOUT,
    0
  ),
  MAX_PER_USER: integer(process.env.GRANT_MAX_PER_USER, 3),
  REISSUE_PER_HOUR: integer(process.env.GRANT_REISSUE_PER_HOUR, 3),
};

export const SESSION_ENV = {
  ABSOLUTE: parseDuration(
    'SESSION_ABSOLUTE',
    process.env.SESSION_ABSOLUTE,
    8 * 60 * 60_000
  ),
  IDLE: parseDuration('SESSION_IDLE', process.env.SESSION_IDLE, 30 * 60_000),
};

/** WireGuard interface hooks; unset values keep the database default. */
export const HOOKS_ENV = {
  PRE_UP: process.env.WG_PRE_UP,
  POST_UP: process.env.WG_POST_UP,
  PRE_DOWN: process.env.WG_PRE_DOWN,
  POST_DOWN: process.env.WG_POST_DOWN,
};

export const WG_ENV = {
  /** UI is hosted on HTTP instead of HTTPS */
  INSECURE: process.env.INSECURE === 'true',
  /** Port the UI is listening on */
  PORT: assertEnv('PORT'),
  /** If IPv6 should be disabled */
  DISABLE_IPV6: !VPN_ENV.IPV6_ENABLED,
  /** Name of the WireGuard interface */
  WG_INTERFACE: parseInterfaceName(process.env.WG_INTERFACE),
  WG_EXECUTABLE: await detectAwg(),
  /** Proxies allowed to provide forwarded request information */
  TRUSTED_PROXIES: parseTrustedProxies(process.env.TRUSTED_PROXIES),
  /** Metrics endpoints are disabled unless explicitly enabled. */
  METRICS_ENABLED: process.env.METRICS_ENABLED === 'true',
  /** Required before destroying long-lived clients from a previous install. */
  PORTAL_WIPE_LEGACY: process.env.PORTAL_WIPE_LEGACY === 'true',
};

SERVER_DEBUG(`
Access portal: OIDC via ${OIDC_ENV.SERVER}
Allowed groups: ${OIDC_ENV.ALLOWED_GROUPS.join(', ') || 'None'}
Allowed domains: ${OIDC_ENV.ALLOWED_DOMAINS.join(', ') || 'All'}
Grant lifetime: ${GRANT_ENV.MAX_LIFETIME / 60_000} min
Session lifetime: ${SESSION_ENV.ABSOLUTE / 60_000} min
`);

function assertEnv<T extends string>(env: T) {
  const val = process.env[env];

  if (!val) {
    throw new Error(`Missing environment variable: ${env}`);
  }

  return val;
}
