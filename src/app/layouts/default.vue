<template>
  <div class="app-shell">
    <a
      href="#main-content"
      class="ui-button ui-button-primary fixed top-2 left-2 z-[100] -translate-y-24 focus:translate-y-0"
    >
      Skip to content
    </a>
    <header
      class="mx-auto flex w-full max-w-3xl items-center gap-x-4 px-4 py-5 sm:px-7 lg:py-6"
    >
      <span class="text-lg font-semibold tracking-tight">WireGuard Access</span>
      <span class="ml-auto text-sm text-neutral-500">Short-lived access</span>
    </header>
    <div id="main-content" class="flex-1" tabindex="-1"><slot /></div>
    <footer class="mx-auto w-full max-w-3xl px-4 py-6 text-xs text-neutral-500">
      Access is issued per login and ends on logout, timeout, or expiry.
    </footer>
  </div>
</template>
