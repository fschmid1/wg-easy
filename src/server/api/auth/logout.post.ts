import { defineEventHandler } from 'nuxt/server';

import { destroySession, logoutUrl } from '#server/features/identity/session';

export default defineEventHandler(async (event) => {
  await destroySession(event);
  return { redirect: await logoutUrl(event) };
});
