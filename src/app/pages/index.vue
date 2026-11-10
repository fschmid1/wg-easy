<template>
  <main class="page-container">
    <div v-if="errorMessage" class="alert mb-8" role="alert">
      <svg
        class="mt-0.5 size-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path
          d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        />
        <path d="M12 9v4M12 17h.01" />
      </svg>
      <span>{{ errorMessage }}</span>
    </div>

    <section
      v-if="!auth.userData && !signInPrompt"
      class="panel flex items-center gap-3 p-5"
      aria-live="polite"
    >
      <span class="spinner" aria-hidden="true" />
      <div>
        <p class="text-sm font-medium">Signing in</p>
        <p class="mt-0.5 text-[13px] text-muted">
          Redirecting to your identity provider…
        </p>
      </div>
    </section>

    <section v-else-if="!auth.userData">
      <div class="max-w-[34rem]">
        <h1 class="display">
          {{ signedOut ? 'Signed out' : 'Request VPN access' }}
        </h1>
        <p v-if="signedOut" class="lede">
          Your session and WireGuard access have ended. Sign in again to get a
          new configuration.
        </p>
        <p v-else class="lede">
          Sign in with your organization account to get a WireGuard
          configuration for this session.
        </p>
        <button class="btn btn-primary mt-7" type="button" @click="signIn">
          Sign in
        </button>
      </div>

      <div class="mt-14 border-t border-line pt-6">
        <p class="eyebrow">How it works</p>
        <dl class="notes">
          <div>
            <dt>One config per session</dt>
            <dd>Issuing another config replaces the current one.</dd>
          </div>
          <div>
            <dt>Download once</dt>
            <dd>The file is shown a single time and cannot be recovered.</dd>
          </div>
          <div>
            <dt>Time-limited</dt>
            <dd>
              Access ends at the deadline shown after issuing, or when you log
              out.
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <template v-else>
      <section class="identity">
        <span v-if="initials" class="avatar" aria-hidden="true">
          {{ initials }}
        </span>
        <div class="min-w-0">
          <p class="eyebrow">Signed in as</p>
          <p class="mt-1 truncate text-sm font-medium">
            {{ auth.userData.name }}
          </p>
          <p v-if="auth.userData.email" class="truncate text-xs text-subtle">
            {{ auth.userData.email }}
          </p>
        </div>
        <button
          class="btn btn-secondary ml-auto"
          type="button"
          :disabled="busy"
          @click="logout"
        >
          Log out
        </button>
      </section>

      <section
        v-if="grants.length === 0"
        class="panel mt-8 grid gap-6 p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-8"
      >
        <div>
          <h1 class="text-2xl font-semibold tracking-[-0.02em]">
            No active access
          </h1>
          <p class="mt-2 max-w-[34rem] text-[15px] leading-6 text-muted">
            Generate a configuration, import it into the WireGuard client, and
            connect before the deadline shown here.
          </p>
          <p class="hint mt-4">
            The file can be downloaded once. If the download is lost, generate a
            new config.
          </p>
        </div>
        <button
          class="btn btn-primary w-full sm:w-auto"
          type="button"
          :disabled="busy"
          @click="generate"
        >
          Generate config
        </button>
      </section>

      <section v-else class="mt-8">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h1 class="text-2xl font-semibold tracking-[-0.02em]">
            Active access
          </h1>
          <p class="text-xs text-subtle">
            {{ grants.length }} of {{ grantsAllowed }} in use
          </p>
        </div>

        <div class="mt-4 space-y-4">
          <article
            v-for="grant in grants"
            :key="grant.id"
            class="panel p-5 sm:p-6"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <h2
                  class="truncate text-[15px] font-semibold tracking-[-0.01em]"
                >
                  {{ grant.name }}
                </h2>
                <p
                  class="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-subtle"
                >
                  <span>{{ grant.ipv4Address }}</span>
                  <span v-if="grant.ipv6Address">{{ grant.ipv6Address }}</span>
                </p>
              </div>
              <span class="badge" :data-state="stateKey(grant)">
                {{ stateLabel(grant) }}
              </span>
            </div>

            <p v-if="!grant.currentSession" class="mt-2 text-xs text-subtle">
              Issued in another session.
            </p>

            <div class="readout" :data-state="stateKey(grant)">
              <div
                class="flex flex-wrap items-end justify-between gap-x-6 gap-y-2"
              >
                <div>
                  <p class="eyebrow">{{ clockLabel(grant) }}</p>
                  <p class="clock">{{ clockValue(grant) }}</p>
                </div>
                <p class="readout-note sm:text-right">{{ clockNote(grant) }}</p>
              </div>
              <div class="meter" aria-hidden="true">
                <span :style="{ width: `${progress(grant)}%` }" />
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <template v-if="grant.state === 'issued' && !isExpired(grant)">
                <button
                  class="btn btn-primary"
                  type="button"
                  :disabled="busy"
                  @click="download(grant)"
                >
                  <svg
                    class="size-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m7 10 5 5 5-5M12 15V3" />
                  </svg>
                  Download .conf
                </button>
                <button
                  class="btn btn-secondary"
                  type="button"
                  :disabled="busy"
                  @click="showQr(grant)"
                >
                  <svg
                    class="size-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <rect width="5" height="5" x="3" y="3" rx="1" />
                    <rect width="5" height="5" x="16" y="3" rx="1" />
                    <rect width="5" height="5" x="3" y="16" rx="1" />
                    <path
                      d="M21 16h-3a2 2 0 0 0-2 2v3M21 21v.01M12 7v3a2 2 0 0 1-2 2H7M3 12h.01M12 3h.01M12 16v.01M16 12h1M21 12v.01M12 21v-1"
                    />
                  </svg>
                  Show QR
                </button>
              </template>
              <button
                class="btn btn-danger ml-auto"
                type="button"
                :disabled="busy"
                @click="revoke(grant)"
              >
                Revoke
              </button>
            </div>

            <div v-if="qrId === grant.id" class="qr">
              <img
                :src="`/api/grants/${grant.id}/qrcode`"
                alt="WireGuard configuration QR code"
                class="qr-image"
              />
              <div>
                <p class="text-sm font-medium">Scan to import</p>
                <p class="mt-1 text-xs leading-5 text-muted">
                  The image contains the config and can be loaded once. Scan it
                  with the WireGuard app before leaving this page.
                </p>
              </div>
            </div>
          </article>
        </div>

        <button
          class="btn btn-secondary mt-4 w-full sm:w-auto"
          type="button"
          :disabled="busy"
          @click="generate"
        >
          Replace config
        </button>
      </section>
    </template>
  </main>
</template>

<script setup lang="ts">
import type {
  GrantListResponse,
  GrantSummary,
} from '#shared/contracts/identity';

const auth = useAuthStore();
const route = useRoute();

// Set before leaving for the identity provider so its return to `/` does not
// immediately sign the user back in through the provider's own SSO session.
const SIGNED_OUT_KEY = 'wg-portal:signed-out';

const grants = ref<GrantSummary[]>([]);
const grantsAllowed = ref(3);
const busy = ref(false);
const qrId = ref<number | null>(null);
const errorMessage = ref<string | null>(null);
const signedOut = ref(false);
const now = ref(Date.now());

const initials = computed(() => {
  const name =
    auth.userData?.name?.trim() || auth.userData?.username?.trim() || '';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
});

const denied = computed(() => route.query.error === 'access_denied');

// A denied login and a deliberate logout must stay on the portal so the user
// can read the message or choose to sign in again.
const signInPrompt = computed(() => denied.value || signedOut.value);

onMounted(async () => {
  signedOut.value = consumeSignedOut();

  if (denied.value) {
    errorMessage.value =
      'You are signed in, but your account is not allowed to request VPN access.';
  }

  if (!auth.userData && !signInPrompt.value) {
    window.location.replace('/api/auth/login');
    return;
  }

  await load();
  const clock = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);
  const poll = window.setInterval(() => {
    if (auth.userData && grants.value.length > 0) {
      void load();
    }
  }, 2000);
  onBeforeUnmount(() => {
    window.clearInterval(clock);
    window.clearInterval(poll);
  });
});

async function load() {
  try {
    const result = await $fetch<GrantListResponse>('/api/grants');
    auth.userData = result.user;
    grants.value = result.grants;
    grantsAllowed.value = result.grantsAllowed;
  } catch {
    auth.userData = null;
    grants.value = [];
  }
}

function signIn() {
  rememberSignedOut(false);
  window.location.href = '/api/auth/login';
}

async function generate() {
  await run(async () => {
    await $fetch('/api/grants', { method: 'POST' });
    qrId.value = null;
    await load();
  });
}

async function download(grant: GrantSummary) {
  qrId.value = null;
  window.location.href = `/api/grants/${grant.id}/configuration`;
  window.setTimeout(() => void load(), 1500);
}

function showQr(grant: GrantSummary) {
  qrId.value = grant.id;
}

async function revoke(grant: GrantSummary) {
  await run(async () => {
    await $fetch(`/api/grants/${grant.id}/revoke`, { method: 'POST' });
    if (qrId.value === grant.id) {
      qrId.value = null;
    }
    await load();
  });
}

async function logout() {
  await run(async () => {
    const result = await $fetch<{ redirect: string }>('/api/auth/logout', {
      method: 'POST',
    });
    rememberSignedOut(true);
    window.location.href = result.redirect;
  });
}

function rememberSignedOut(value: boolean) {
  try {
    if (value) {
      window.sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    } else {
      window.sessionStorage.removeItem(SIGNED_OUT_KEY);
    }
  } catch {
    // Storage can be unavailable in privacy modes; never block the flow.
  }
}

function consumeSignedOut() {
  try {
    if (window.sessionStorage.getItem(SIGNED_OUT_KEY) !== '1') {
      return false;
    }
    window.sessionStorage.removeItem(SIGNED_OUT_KEY);
    return true;
  } catch {
    return false;
  }
}

async function run(operation: () => Promise<void>) {
  busy.value = true;
  errorMessage.value = null;
  try {
    await operation();
  } catch (error) {
    errorMessage.value = messageOf(error);
  } finally {
    busy.value = false;
  }
}

function messageOf(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { statusText?: string; message?: string } })
      .data;
    return data?.statusText ?? data?.message ?? 'Request failed';
  }
  return 'Request failed';
}

function remaining(deadline: number) {
  const left = Math.max(0, deadline - now.value);
  const totalSeconds = Math.ceil(left / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function formatTime(deadline: number) {
  return new Date(deadline).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isExpired(grant: GrantSummary) {
  if (now.value >= grant.expiresAt) {
    return true;
  }
  if (grant.state === 'connected') {
    return false;
  }
  if (grant.state === 'delivered') {
    return now.value >= grant.connectDeadline;
  }
  return now.value >= grant.downloadDeadline;
}

function stateLabel(grant: GrantSummary) {
  if (isExpired(grant)) {
    return 'Expired';
  }
  if (grant.state === 'connected') {
    return 'Connected';
  }
  return grant.state === 'delivered' ? 'Waiting' : 'Ready';
}

function stateKey(grant: GrantSummary) {
  if (isExpired(grant)) {
    return 'expired';
  }
  if (grant.state === 'connected') {
    return 'connected';
  }
  return grant.state === 'delivered' ? 'waiting' : 'ready';
}

function deadlineOf(grant: GrantSummary) {
  if (grant.state === 'connected') {
    return grant.expiresAt;
  }
  if (grant.state === 'delivered') {
    return grant.connectDeadline;
  }
  return grant.downloadDeadline;
}

function clockLabel(grant: GrantSummary) {
  if (isExpired(grant)) {
    return 'Access ended';
  }
  if (grant.state === 'connected') {
    return 'Access ends in';
  }
  if (grant.state === 'delivered') {
    return 'Connect within';
  }
  return 'Download within';
}

function clockValue(grant: GrantSummary) {
  return isExpired(grant) ? '0s' : remaining(deadlineOf(grant));
}

function clockNote(grant: GrantSummary) {
  if (isExpired(grant)) {
    return `Expired at ${formatTime(deadlineOf(grant))}.`;
  }
  if (grant.state === 'connected') {
    return `Expires at ${formatTime(grant.expiresAt)}.`;
  }
  if (grant.state === 'delivered') {
    return 'Waiting for the first handshake. The config cannot be shown again.';
  }
  return `Import it into WireGuard and connect before ${formatTime(
    grant.connectDeadline
  )}.`;
}

function progress(grant: GrantSummary) {
  const start = Date.parse(grant.createdAt);
  const end = deadlineOf(grant);
  if (!(end > start)) {
    return isExpired(grant) ? 0 : 100;
  }
  const ratio = (end - now.value) / (end - start);
  return Math.min(100, Math.max(0, ratio * 100));
}
</script>
