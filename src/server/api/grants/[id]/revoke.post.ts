import { createError, getRouterParam } from 'nuxt/server';

import { defineAuthenticatedEventHandler } from '#server/utils/handler';
import { revokeGrant } from '#server/features/vpn/grants';

export default defineAuthenticatedEventHandler(async ({ event, user }) => {
  const id = Number.parseInt(getRouterParam(event, 'id') ?? '', 10);
  if (!Number.isInteger(id)) {
    throw createError({ status: 400, statusText: 'Invalid grant' });
  }
  await revokeGrant(user, id);
  return { success: true };
});
