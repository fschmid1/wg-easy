import { createHash, randomBytes } from 'node:crypto';

import {
  createError,
  deleteCookie,
  getCookie,
  setCookie,
  useSession,
} from 'nuxt/server';
import type { RequestEvent } from 'nuxt/server';
import * as oauthClient from 'openid-client';

import * as oauth from './oauth';

import * as grants from '#server/features/vpn/grants';
import { publicUser } from '#server/features/identity';
import { getDatabase } from '#db';
import {
  OIDC_ENV,
  SESSION_ENV,
  SERVER_DEBUG,
  WG_ENV,
} from '#server/utils/config';
import type { PortalUser } from '#shared/contracts/identity';

const SESSION_COOKIE = 'wg-portal';
const FLOW_COOKIE = 'wg-portal-flow';

type FlowSession = Partial<{
  oauth_verifier: string;
  oauth_nonce: string;
  oauth_state: string;
}>;

const clearFlow = {
  oauth_nonce: undefined,
  oauth_state: undefined,
  oauth_verifier: undefined,
};

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

async function sessionPassword() {
  return (await getDatabase().general.getSessionConfig()).sessionPassword;
}

async function useFlowSession(event: RequestEvent) {
  return useSession<FlowSession>(event, {
    name: FLOW_COOKIE,
    password: await sessionPassword(),
    maxAge: 10 * 60,
    cookie: { maxAge: 10 * 60, secure: !WG_ENV.INSECURE },
  });
}

export async function beginLogin(event: RequestEvent) {
  const config = await oauth.buildOidcConfig();
  const verifier = oauthClient.randomPKCECodeVerifier();
  const challenge = await oauthClient.calculatePKCECodeChallenge(verifier);
  const nonce = oauthClient.randomNonce();
  const state = oauthClient.randomState();
  const session = await useFlowSession(event);
  await session.update({
    ...clearFlow,
    oauth_nonce: nonce,
    oauth_verifier: verifier,
    oauth_state: state,
  });
  return oauthClient
    .buildAuthorizationUrl(config, {
      redirect_uri: oauth.callbackUrl(event),
      scope: OIDC_ENV.SCOPES.join(' '),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      nonce,
      state,
    })
    .toString();
}

export async function completeLogin(event: RequestEvent) {
  const config = await oauth.buildOidcConfig();
  const session = await useFlowSession(event);
  const { oauth_nonce, oauth_verifier, oauth_state } = session.data;
  if (!oauth_nonce || !oauth_verifier || !oauth_state) {
    throw createError({ status: 400, statusText: 'Missing OAuth state' });
  }
  await session.update(clearFlow);

  const info = await oauth.getUserInfo(event, config, {
    oauth_nonce,
    oauth_verifier,
    oauth_state,
  });

  const user = await upsertUser(info);
  await grants.enforceCap(user.id);
  await createSession(event, user.id);
  SERVER_DEBUG(`New portal session for user ${user.id} (${user.username})`);
  return publicUser(user);
}

async function upsertUser(info: {
  sub: string;
  email: string;
  username: string;
  name: string;
}) {
  return getDatabase().transaction(async ({ users }) => {
    const linked = await users.getByOAuth('oidc', info.sub);
    if (linked) {
      return linked;
    }
    const existing = await users.getByEmail(info.email);
    if (existing) {
      await users.update(existing.id, {
        oauthProvider: 'oidc',
        oauthId: info.sub,
      });
      return { ...existing, oauthProvider: 'oidc', oauthId: info.sub };
    }
    let username = info.username;
    for (let suffix = 1; await users.getByUsername(username); suffix++) {
      username = `${info.username}-${suffix}`;
    }
    const [created] = await users.insert({
      username,
      password: null,
      email: info.email,
      name: info.name,
      role: 2,
      totpVerified: false,
      enabled: true,
      oauthProvider: 'oidc',
      oauthId: info.sub,
    });
    if (!created) {
      throw new Error('Failed to create user');
    }
    return created;
  });
}

async function createSession(event: RequestEvent, userId: number) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_ENV.ABSOLUTE).toISOString();
  await getDatabase().sessions.create(hashToken(token), userId, expiresAt);
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !WG_ENV.INSECURE,
    path: '/',
    maxAge: Math.floor(SESSION_ENV.ABSOLUTE / 1000),
  });
}

export async function currentSessionId(event: RequestEvent) {
  const token = getCookie(event, SESSION_COOKIE);
  return token ? hashToken(token) : undefined;
}

export async function getCurrentUser(event: RequestEvent): Promise<PortalUser> {
  const token = getCookie(event, SESSION_COOKIE);
  if (!token) {
    throw createError({ status: 401, statusText: 'Not authenticated' });
  }
  const id = hashToken(token);
  const row = await getDatabase().sessions.get(id);
  if (!row || row.revokedAt) {
    throw createError({ status: 401, statusText: 'Not authenticated' });
  }
  const now = Date.now();
  if (now >= Date.parse(row.expiresAt)) {
    await endSession(id);
    throw createError({ status: 401, statusText: 'Session expired' });
  }
  if (now - Date.parse(row.lastSeenAt) > SESSION_ENV.IDLE) {
    await endSession(id);
    throw createError({ status: 401, statusText: 'Session timed out' });
  }
  if (now - Date.parse(row.lastSeenAt) > 60_000) {
    await getDatabase().sessions.touch(id, new Date(now).toISOString());
  }
  const user = await getDatabase().users.get(row.userId);
  if (!user || !user.enabled) {
    throw createError({ status: 401, statusText: 'Not authenticated' });
  }
  return publicUser(user);
}

/** Revokes the current session and its grant, then clears the cookie. */
export async function destroySession(event: RequestEvent) {
  const id = await currentSessionId(event);
  if (id) {
    await endSession(id);
  }
  deleteCookie(event, SESSION_COOKIE, { path: '/' });
}

/** Fails closed: the session ends even if the peer removal has to be retried. */
async function endSession(id: string) {
  try {
    await grants.revokeSessionGrants(id);
  } catch (error) {
    SERVER_DEBUG('Failed to revoke a grant while ending a session:', error);
  } finally {
    await getDatabase().sessions.revoke(id);
  }
}

/** Best-effort RP-initiated logout at the identity provider. */
export async function logoutUrl(event: RequestEvent) {
  try {
    const config = await oauth.buildOidcConfig();
    return oauthClient
      .buildEndSessionUrl(config, {
        client_id: OIDC_ENV.CLIENT_ID!,
        post_logout_redirect_uri: oauth
          .callbackUrl(event)
          .replace('/api/auth/callback', '/'),
      })
      .toString();
  } catch (error) {
    SERVER_DEBUG('IdP logout unavailable:', error);
    return '/';
  }
}
