/*
 * Minimal OpenID Connect provider for the end-to-end suite.
 *
 * It is intentionally not production code: authorization always succeeds for
 * the configured user, and the group list comes from MOCK_OIDC_GROUPS so a
 * test project can decide whether the portal must reject the login.
 */
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_OIDC_PORT ?? 9000);
const ISSUER = process.env.MOCK_OIDC_ISSUER ?? `http://mock-oidc:${PORT}`;
const CLIENT_ID = process.env.MOCK_OIDC_CLIENT_ID ?? 'wg-easy';
const CLIENT_SECRET = process.env.MOCK_OIDC_CLIENT_SECRET ?? 'e2e-secret';
const KID = 'e2e-key';

const groups = (process.env.MOCK_OIDC_GROUPS ?? 'vpn-users')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const subject = process.env.MOCK_OIDC_SUB ?? 'e2e-subject';
const email = process.env.MOCK_OIDC_EMAIL ?? 'e2e-user@example.test';
const username = process.env.MOCK_OIDC_USERNAME ?? 'e2e-user';
const name = process.env.MOCK_OIDC_NAME ?? 'E2E User';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: KID,
  alg: 'RS256',
  use: 'sig',
};

/** code -> authorization request state */
const codes = new Map();
/** access token -> expiry */
const accessTokens = new Map();

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(payload) {
  const header = { alg: 'RS256', typ: 'JWT', kid: KID };
  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = sign('RSA-SHA256', Buffer.from(body), privateKey);
  return `${body}.${signature.toString('base64url')}`;
}

function discovery() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/jwks`,
    end_session_endpoint: `${ISSUER}/logout`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'email', 'profile', 'groups'],
    token_endpoint_auth_methods_supported: [
      'client_secret_basic',
      'client_secret_post',
    ],
    claims_supported: [
      'sub',
      'email',
      'email_verified',
      'name',
      'preferred_username',
      'groups',
    ],
  };
}

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function redirect(response, target) {
  response.writeHead(302, { Location: target });
  response.end();
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

function clientIsAuthenticated(request, parameters) {
  const header = request.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    const separator = decoded.indexOf(':');
    return (
      decoded.slice(0, separator) === CLIENT_ID &&
      decoded.slice(separator + 1) === CLIENT_SECRET
    );
  }
  return (
    parameters.get('client_id') === CLIENT_ID &&
    parameters.get('client_secret') === CLIENT_SECRET
  );
}

function claims() {
  return {
    sub: subject,
    email,
    email_verified: true,
    preferred_username: username,
    name,
    groups,
  };
}

async function handleAuthorize(request, response, url) {
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  if (!redirectUri || !state) {
    json(response, 400, { error: 'invalid_request' });
    return;
  }

  const code = randomUUID();
  codes.set(code, {
    nonce: url.searchParams.get('nonce'),
    codeChallenge: url.searchParams.get('code_challenge'),
    redirectUri,
  });

  const target = new URL(redirectUri);
  target.searchParams.set('code', code);
  target.searchParams.set('state', state);
  redirect(response, target.toString());
}

async function handleToken(request, response) {
  const body = new URLSearchParams(await readBody(request));
  if (!clientIsAuthenticated(request, body)) {
    json(response, 401, { error: 'invalid_client' });
    return;
  }
  if (body.get('grant_type') !== 'authorization_code') {
    json(response, 400, { error: 'unsupported_grant_type' });
    return;
  }

  const code = body.get('code') ?? '';
  const stored = codes.get(code);
  if (!stored) {
    json(response, 400, { error: 'invalid_grant' });
    return;
  }
  codes.delete(code);

  if (stored.codeChallenge) {
    const verifier = body.get('code_verifier') ?? '';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    if (challenge !== stored.codeChallenge) {
      json(response, 400, { error: 'invalid_grant' });
      return;
    }
  }

  const accessToken = randomUUID();
  const expiresAt = Date.now() + 300_000;
  accessTokens.set(accessToken, expiresAt);

  const now = Math.floor(Date.now() / 1000);
  const idToken = signJwt({
    iss: ISSUER,
    sub: subject,
    aud: CLIENT_ID,
    iat: now,
    exp: now + 300,
    nonce: stored.nonce,
    ...claims(),
    at_hash: createHash('sha256')
      .update(accessToken)
      .digest()
      .subarray(0, 16)
      .toString('base64url'),
  });

  json(response, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 300,
    id_token: idToken,
  });
}

function handleUserInfo(request, response) {
  const header = request.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!accessTokens.has(token)) {
    json(response, 401, { error: 'invalid_token' });
    return;
  }
  json(response, 200, claims());
}

function handleJwks(response) {
  json(response, 200, { keys: [jwk] });
}

function handleLogout(response, url) {
  const target = url.searchParams.get('post_logout_redirect_uri') ?? '/';
  try {
    redirect(response, new URL(target).toString());
  } catch {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Logged out');
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', ISSUER);
  try {
    if (url.pathname === '/health') {
      response.writeHead(200, { 'Content-Type': 'text/plain' });
      response.end('ok');
      return;
    }
    if (
      url.pathname === '/.well-known/openid-configuration' ||
      url.pathname === '/.well-known/oauth-authorization-server'
    ) {
      json(response, 200, discovery());
      return;
    }
    if (url.pathname === '/jwks') {
      handleJwks(response);
      return;
    }
    if (url.pathname === '/authorize') {
      await handleAuthorize(request, response, url);
      return;
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      await handleToken(request, response);
      return;
    }
    if (url.pathname === '/userinfo') {
      handleUserInfo(request, response);
      return;
    }
    if (url.pathname === '/logout') {
      handleLogout(response, url);
      return;
    }
    json(response, 404, { error: 'not_found' });
  } catch (error) {
    console.error('Mock OIDC error:', error);
    json(response, 500, { error: 'server_error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Mock OIDC listening on ${ISSUER} (groups: ${groups.join(', ') || 'none'})`
  );
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
