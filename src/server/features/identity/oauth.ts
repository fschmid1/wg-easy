import { createError } from 'nuxt/server';
import * as client from 'openid-client';
import type { RequestEvent } from 'nuxt/server';

import { OIDC_ENV, WG_ENV } from '#server/utils/config';
import { getTrustedRequestURL } from '#server/http/request';

export async function buildOidcConfig() {
  if (!OIDC_ENV.CLIENT_ID || !OIDC_ENV.CLIENT_SECRET) {
    throw createError({
      status: 503,
      statusText: 'OIDC is not configured',
    });
  }
  // Discovery refuses plain HTTP unless explicitly allowed. INSECURE already
  // marks an HTTP deployment, so it also covers an HTTP identity provider.
  return client.discovery(
    new URL(OIDC_ENV.SERVER),
    OIDC_ENV.CLIENT_ID,
    { client_secret: OIDC_ENV.CLIENT_SECRET },
    undefined,
    WG_ENV.INSECURE ? { execute: [client.allowInsecureRequests] } : undefined
  );
}

export function callbackUrl(event: RequestEvent) {
  const { origin } = getTrustedRequestURL(
    event,
    WG_ENV.TRUSTED_PROXIES,
    WG_ENV.INSECURE ? 'http' : 'https'
  );
  return `${origin}/api/auth/callback`;
}

type OauthState = {
  oauth_nonce: string;
  oauth_verifier: string;
  oauth_state: string;
};

export async function getUserInfo(
  event: RequestEvent,
  config: client.Configuration,
  state: OauthState
) {
  const tokens = await client.authorizationCodeGrant(
    config,
    getTrustedRequestURL(
      event,
      WG_ENV.TRUSTED_PROXIES,
      WG_ENV.INSECURE ? 'http' : 'https'
    ),
    {
      pkceCodeVerifier: state.oauth_verifier,
      expectedNonce: state.oauth_nonce,
      expectedState: state.oauth_state,
      idTokenExpected: true,
    }
  );

  const subject = tokens.claims()?.sub;
  if (!subject) {
    throw createError({ status: 400, statusText: "Can't get subject" });
  }

  const userInfo = await client.fetchUserInfo(
    config,
    tokens.access_token,
    subject
  );

  if (!userInfo.sub) {
    throw createError({ status: 400, statusText: 'No sub set' });
  }
  if (!userInfo.email) {
    throw createError({ status: 400, statusText: 'No email set' });
  }
  if (!userInfo.email_verified) {
    throw createError({ status: 401, statusText: 'Email is not verified' });
  }
  assertAllowedDomain(userInfo.email);
  assertAllowedGroup(userInfo);

  return {
    sub: userInfo.sub,
    email: userInfo.email,
    username: userInfo.preferred_username || userInfo.email,
    name: userInfo.name || userInfo.preferred_username || 'User',
  };
}

function assertAllowedDomain(email: string) {
  if (OIDC_ENV.ALLOWED_DOMAINS.length === 0) {
    return;
  }
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  if (!OIDC_ENV.ALLOWED_DOMAINS.includes(domain)) {
    throw createError({ status: 403, statusText: 'Access denied' });
  }
}

function assertAllowedGroup(userInfo: client.UserInfoResponse) {
  const values = groupsFromClaims(userInfo, OIDC_ENV.GROUPS_CLAIM);
  // Fail closed: a missing claim never grants access.
  if (!values.some((value) => OIDC_ENV.ALLOWED_GROUPS.includes(value))) {
    throw createError({ status: 403, statusText: 'Access denied' });
  }
}

/** Normalises a claim that may be a string, an array, or absent. */
export function groupsFromClaims(source: unknown, path: string) {
  const claim = readClaim(source, path);
  return (Array.isArray(claim) ? claim : [claim])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim());
}

/** Reads a dotted claim path, e.g. `realm_access.roles`. */
export function readClaim(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object' && key in value) {
      return (value as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}
