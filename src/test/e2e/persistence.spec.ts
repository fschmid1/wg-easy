import { expect, test } from './fixtures';
import { currentGrant, generateGrant, goto, login, logout } from './helpers';

test('a restart keeps the session and its live grant', async ({
  page,
  app,
}) => {
  await login(page);
  await generateGrant(page);
  const grant = await currentGrant(page);

  // Stop polling while the interface is down so UI errors cannot race the test.
  await page.goto('about:blank');
  const restartedUrl = await app.restart();
  await goto(page, restartedUrl);

  await expect(page.getByText('Signed in as', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: grant.name, exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Download .conf', exact: true })
  ).toBeVisible();

  await logout(page);
});
