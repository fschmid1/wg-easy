import { defineAuthenticatedEventHandler } from '#server/utils/handler';
import { currentSessionId } from '#server/features/identity/session';
import { listGrants } from '#server/features/vpn/grants';
import type { GrantListResponse } from '#shared/contracts/identity';

export default defineAuthenticatedEventHandler(
  async ({ event, user }): Promise<GrantListResponse> => {
    const grants = await listGrants(user, await currentSessionId(event));
    return { user, ...grants };
  }
);
