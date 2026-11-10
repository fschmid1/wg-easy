import type { RequestEvent } from 'nuxt/server';

type NodeResponse = {
  writableFinished?: boolean;
  once?: (event: 'finish' | 'close', listener: () => void) => void;
};

/**
 * Runs `completed` when the response fully flushed, or `aborted` when the
 * client disconnected first. Nuxt 4.6 types the event as web-standard, so the
 * Node response (present under Nitro) is accessed through a narrow cast.
 */
export function onResponseSettled(
  event: RequestEvent,
  completed: () => void,
  aborted: () => void
) {
  const res = (event as unknown as { node?: { res?: NodeResponse } }).node?.res;
  if (!res?.once) {
    // Non-Node runtime: the handler returned, so treat it as delivered.
    completed();
    return;
  }
  let settled = false;
  const settle = () => {
    if (settled) {
      return;
    }
    settled = true;
    if (res.writableFinished) {
      completed();
    } else {
      aborted();
    }
  };
  res.once('finish', settle);
  res.once('close', settle);
}
