import { expect, test } from './fixtures';
import { login, loginDenied, reload } from './helpers';

test('an unauthenticated visit redirects to OIDC and logout ends the session', async ({
  page,
}) => {
  expect((await page.request.get('/api/grants')).status()).toBe(401);

  const authorize = page.waitForRequest((request) =>
    request.url().includes('/authorize')
  );
  await login(page);
  expect((await authorize).url()).toContain('response_type=code');

  await reload(page);
  await expect(page.getByText('Signed in as', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/grants')).status()).toBe(200);

  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true })
  ).toBeVisible();
  expect((await page.request.get('/api/grants')).status()).toBe(401);
  expect((await page.request.post('/api/grants')).status()).toBe(401);
});

test.describe('group entitlement', () => {
  test.use({ groups: 'some-other-group' });

  test('a user outside the allowed group is refused', async ({ page }) => {
    await loginDenied(page);
    expect((await page.request.get('/api/grants')).status()).toBe(401);
  });
});
