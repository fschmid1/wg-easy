import type { PortalUser } from '#shared/contracts/identity';

export const useAuthStore = defineStore('Auth', () => {
  // Forward the request cookie during SSR so the server already knows whether
  // the visitor has a session and does not render the signed-out portal first.
  const requestFetch = useRequestFetch();
  const userData = useState<PortalUser | null>('user-data', () => null);

  async function getSession() {
    try {
      return await requestFetch<PortalUser>('/api/session');
    } catch {
      return null;
    }
  }

  async function update() {
    userData.value = await getSession();
  }

  return { userData, update, getSession };
});
