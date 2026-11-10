import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  workers: 1,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // The browser drives the mock IdP by name; Docker resolves the same name
      // to the mock service, while the host reaches it on the published port.
      args: ['--host-resolver-rules=MAP mock-oidc 127.0.0.1'],
    },
  },
});
