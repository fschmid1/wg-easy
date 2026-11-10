import type { PortalUser } from '#shared/contracts/identity';

export const useAuthStore = defineStore('Auth', () => {
  const userData = useState<PortalUser | null>('user-data', () => null);

  async function getSession() {
    try {
      return await $fetch<PortalUser>('/api/session');
    } catch {
      return null;
    }
  }

  async function update() {
    userData.value = await getSession();
  }

  return { userData, update, getSession };
});
