import { defineEventHandler, sendRedirect } from 'nuxt/server';

import { completeLogin } from '#server/features/identity/session';
import { SERVER_DEBUG } from '#server/utils/config';

export default defineEventHandler(async (event) => {
  try {
    await completeLogin(event);
    return sendRedirect(event, '/');
  } catch (error) {
    SERVER_DEBUG('OIDC login rejected:', error);
    return sendRedirect(event, '/?error=access_denied');
  }
});
