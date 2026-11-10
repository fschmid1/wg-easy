import type { UserType } from '#db/repositories/user/types';
import type { PortalUser } from '#shared/contracts/identity';

export function publicUser(user: UserType): PortalUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
  };
}
