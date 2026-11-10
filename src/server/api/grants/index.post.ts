import { createError } from 'nuxt/server';

import { defineAuthenticatedEventHandler } from '#server/utils/handler';
import { currentSessionId } from '#server/features/identity/session';
import { issueGrant } from '#server/features/vpn/grants';

export default defineAuthenticatedEventHandler(async ({ event, user }) => {
  const sessionId = await currentSessionId(event);
  if (!sessionId) {
    throw createError({ status: 401, statusText: 'Not authenticated' });
  }
  return issueGrant(user, sessionId, event.req.headers.get('user-agent'));
});
