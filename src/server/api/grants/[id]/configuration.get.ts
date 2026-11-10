import { createError, getRouterParam } from 'nuxt/server';

import { defineAuthenticatedEventHandler } from '#server/utils/handler';
import {
  beginReveal,
  burnPrivateKey,
  releaseReveal,
} from '#server/features/vpn/grants';
import { onResponseSettled } from '#server/http/response';

export default defineAuthenticatedEventHandler(async ({ event, user }) => {
  const id = Number.parseInt(getRouterParam(event, 'id') ?? '', 10);
  if (!Number.isInteger(id)) {
    throw createError({ status: 400, statusText: 'Invalid grant' });
  }
  const reveal = await beginReveal(user, id);

  event.res.headers.set(
    'Content-Disposition',
    `attachment; filename="${reveal.filename}"`
  );
  event.res.headers.set('Content-Type', 'application/x-wireguard-config');
  event.res.headers.set('Cache-Control', 'no-store');

  onResponseSettled(
    event,
    () => void burnPrivateKey(reveal.id).catch(() => {}),
    () => void releaseReveal(reveal.id, reveal.claimedAt).catch(() => {})
  );

  return reveal.contents;
});
