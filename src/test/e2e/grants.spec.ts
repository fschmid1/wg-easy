import { expect, test } from './fixtures';
import {
  currentGrant,
  downloadConfiguration,
  generateGrant,
  login,
  logout,
} from './helpers';

test('a config is delivered once, connects, and logout revokes the peer', async ({
  page,
  app,
}) => {
  await login(page);
  const card = await generateGrant(page);
  const grant = await currentGrant(page);

  const { filename, contents } = await downloadConfiguration(page, card);
  expect(filename).toMatch(/\.conf$/);
  expect(contents).toContain('[Interface]');
  expect(contents).toContain('[Peer]');
  expect(contents).toContain('MTU = 1300');
  expect(contents).toContain('Endpoint = vpn.example.test:51820');
  expect(contents).toContain(`PublicKey = ${await app.serverPublicKey()}`);

  const privateKey = contents.match(/^PrivateKey = (.+)$/m)?.[1];
  expect(privateKey).toBeTruthy();
  const publicKey = await app.publicKey(privateKey!);
  await expect.poll(app.peers).toContain(publicKey);

  await expect(page.getByText(/Waiting for the first handshake/)).toBeVisible();
  expect(
    (await page.request.get(`/api/grants/${grant.id}/configuration`)).status()
  ).toBe(409);
  await expect(
    page.getByRole('button', { name: 'Download .conf', exact: true })
  ).toHaveCount(0);

  await app.connectClient(contents);
  await expect
    .poll(() => app.pingFromClient('10.8.0.1'), { timeout: 30_000 })
    .toBe(true);
  await expect(page.getByText('Connected', { exact: true })).toBeVisible({
    timeout: 45_000,
  });

  await logout(page);
  await expect.poll(app.peers, { timeout: 30_000 }).not.toContain(publicKey);
  await expect
    .poll(() => app.pingFromClient('10.8.0.1'), { timeout: 30_000 })
    .toBe(false);
  expect((await page.request.get('/api/grants')).status()).toBe(401);
});
