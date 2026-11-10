export default defineNuxtRouteMiddleware(async () => {
  const authStore = useAuthStore();
  authStore.userData = await authStore.getSession();
});
