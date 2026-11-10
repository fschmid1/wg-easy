import { expect, test } from './fixtures';
import { goto, login, loginDenied, reload } from './helpers';

test('an OIDC login creates a portal session that logout ends', async ({
  page,
}) => {
  await goto(page, '/');
  expect((await page.request.get('/api/grants')).status()).toBe(401);

  await login(page);
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
