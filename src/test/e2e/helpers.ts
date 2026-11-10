import { text } from 'node:stream/consumers';

import { waitForHydration } from '@nuxt/test-utils/e2e';
import type { Locator, Page } from '@playwright/test';

import { expect } from './fixtures';

export async function goto(page: Page, url: string) {
  await page.goto(url);
  await waitForHydration(page, url, 'hydration');
}

export async function reload(page: Page) {
  await page.reload();
  await waitForHydration(page, page.url(), 'hydration');
}

export async function login(page: Page, url = '/') {
  await goto(page, url);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Signed in as', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'No active access', exact: true })
  ).toBeVisible();
}

export async function loginDenied(page: Page) {
  await goto(page, '/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByText(/not allowed to request VPN access/)
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true })
  ).toBeVisible();
}

export async function generateGrant(page: Page) {
  await page
    .getByRole('button', { name: 'Generate config', exact: true })
    .click();
  const card = page.getByRole('article').first();
  await expect(card).toBeVisible();
  return card;
}

export async function currentGrant(page: Page) {
  const response = await page.request.get('/api/grants');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    grants: Array<{ id: number; name: string }>;
  };
  expect(body.grants).toHaveLength(1);
  return body.grants[0]!;
}

export async function downloadConfiguration(page: Page, card: Locator) {
  const downloading = page.waitForEvent('download');
  await card
    .getByRole('button', { name: 'Download .conf', exact: true })
    .click();
  const download = await downloading;
  expect(await download.failure()).toBeNull();
  return {
    filename: download.suggestedFilename(),
    contents: await text(await download.createReadStream()),
  };
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true })
  ).toBeVisible();
}
