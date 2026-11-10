// Deterministic environment for modules that read configuration at import time.
process.env.PORT ??= '51821';
process.env.OAUTH_OIDC_SERVER ??= 'https://idp.example.com';
process.env.OAUTH_OIDC_CLIENT_ID ??= 'test-client';
process.env.OAUTH_OIDC_CLIENT_SECRET ??= 'test-secret';
process.env.OIDC_ALLOWED_GROUPS ??= 'vpn-users';
