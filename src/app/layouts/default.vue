<template>
  <div class="app-shell">
    <a href="#main-content" class="skip-link">Skip to content</a>

    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <img
            src="/favicon.png"
            alt=""
            width="28"
            height="28"
            class="brand-mark"
          />
          <span class="brand-name">WireGuard Access</span>
        </div>

        <ClientOnly>
          <button
            class="icon-button ml-auto"
            type="button"
            :aria-label="themeLabel"
            :title="themeLabel"
            @click="toggleTheme"
          >
            <svg
              v-if="isDark"
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
              />
            </svg>
            <svg
              v-else
              class="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            </svg>
          </button>
          <template #fallback>
            <span class="icon-button ml-auto" aria-hidden="true" />
          </template>
        </ClientOnly>
      </div>
    </header>

    <div id="main-content" class="flex-1" tabindex="-1">
      <slot />
    </div>

    <footer class="site-footer">
      <div class="footer-inner">
        <span>wg-easy</span>
        <span>Access ends on logout or expiry.</span>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');
const themeLabel = computed(() =>
  isDark.value ? 'Switch to light theme' : 'Switch to dark theme'
);

function toggleTheme() {
  colorMode.preference = isDark.value ? 'light' : 'dark';
}
</script>
