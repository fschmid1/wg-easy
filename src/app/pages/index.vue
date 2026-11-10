<template>
  <main class="mx-auto w-full max-w-3xl px-4 sm:px-7">
    <div
      v-if="errorMessage"
      class="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <section v-if="!auth.userData" class="rounded-xl border p-6">
      <h1 class="text-xl font-semibold">Request VPN access</h1>
      <p class="mt-2 text-sm text-neutral-600">
        Sign in with your identity provider to request a short-lived WireGuard
        configuration. Access ends when you log out, when the connection
        deadline passes, or when the grant expires.
      </p>
      <button
        class="ui-button ui-button-primary mt-5"
        type="button"
        @click="signIn"
      >
        Sign in
      </button>
    </section>

    <template v-else>
      <section class="mb-6 flex items-center justify-between gap-4">
        <div>
          <p class="text-sm text-neutral-500">Signed in as</p>
          <p class="font-medium">{{ auth.userData.name }}</p>
          <p class="text-xs text-neutral-500">{{ auth.userData.email }}</p>
        </div>
        <button
          class="ui-button"
          type="button"
          :disabled="busy"
          @click="logout"
        >
          Log out
        </button>
      </section>

      <section v-if="grants.length === 0" class="rounded-xl border p-6">
        <h1 class="text-xl font-semibold">No active access</h1>
        <p class="mt-2 text-sm text-neutral-600">
          Generate a configuration, import it into the WireGuard client, and
          connect within {{ minutes(connectDeadlineMs) }} of issuing it.
        </p>
        <button
          class="ui-button ui-button-primary mt-5"
          type="button"
          :disabled="busy"
          @click="generate"
        >
          Generate config
        </button>
        <p class="mt-4 text-xs text-neutral-500">
          The config can be revealed exactly once. If the download is lost it
          cannot be shown again; generate a new one instead.
        </p>
      </section>

      <section v-else class="space-y-4">
        <article
          v-for="grant in grants"
          :key="grant.id"
          class="rounded-xl border p-5"
        >
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 class="font-semibold">{{ grant.name }}</h2>
              <p class="text-xs text-neutral-500">
                {{ grant.ipv4Address }}
                <span v-if="grant.ipv6Address">· {{ grant.ipv6Address }}</span>
                <span v-if="!grant.currentSession">· another session</span>
              </p>
            </div>
            <span
              class="rounded-full px-2 py-0.5 text-xs font-medium"
              :class="badgeClass(grant)"
            >
              {{ stateLabel(grant) }}
            </span>
          </div>

          <p v-if="grant.state === 'issued'" class="mt-4 text-sm">
            Download within
            <strong>{{ remaining(grant.downloadDeadline) }}</strong>
            and connect within
            <strong>{{ remaining(grant.connectDeadline) }}</strong>
            .
          </p>
          <p v-else-if="grant.state === 'delivered'" class="mt-4 text-sm">
            Waiting for the first handshake —
            <strong>{{ remaining(grant.connectDeadline) }}</strong>
            left to connect. The configuration can no longer be shown.
          </p>
          <p v-else class="mt-4 text-sm">
            Connected. Access ends in
            <strong>{{ remaining(grant.expiresAt) }}</strong>
            .
          </p>

          <div class="mt-4 flex flex-wrap gap-2">
            <template v-if="grant.state === 'issued'">
              <button
                class="ui-button ui-button-primary"
                type="button"
                :disabled="busy"
                @click="download(grant)"
              >
                Download .conf
              </button>
              <button
                class="ui-button"
                type="button"
                :disabled="busy"
                @click="showQr(grant)"
              >
                Show QR
              </button>
            </template>
            <button
              class="ui-button"
              type="button"
              :disabled="busy"
              @click="revoke(grant)"
            >
              Revoke
            </button>
          </div>

          <div v-if="qrId === grant.id" class="mt-4">
            <p class="mb-2 text-xs text-neutral-500">
              This QR encodes the configuration and can be shown once.
            </p>
            <img
              :src="`/api/grants/${grant.id}/qrcode`"
              alt="WireGuard configuration QR code"
              class="h-56 w-56 bg-white p-2"
            />
          </div>
        </article>

        <button
          class="ui-button"
          type="button"
          :disabled="busy"
          @click="generate"
        >
          Replace with a new config
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

const grants = ref<GrantSummary[]>([]);
const busy = ref(false);
const qrId = ref<number | null>(null);
const errorMessage = ref<string | null>(null);
const now = ref(Date.now());

const connectDeadlineMs = computed(() => {
  const grant = grants.value[0];
  return grant
    ? grant.connectDeadline - Date.parse(grant.createdAt)
    : 10 * 60_000;
});

const denied = computed(() => route.query.error === 'access_denied');

onMounted(async () => {
  if (denied.value) {
    errorMessage.value =
      'You are signed in, but your account is not allowed to request VPN access.';
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
  } catch {
    auth.userData = null;
    grants.value = [];
  }
}

function signIn() {
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
    window.location.href = result.redirect;
  });
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

function minutes(milliseconds: number) {
  return `${Math.round(milliseconds / 60_000)} minutes`;
}

function stateLabel(grant: GrantSummary) {
  if (now.value >= grant.expiresAt) {
    return 'Expired';
  }
  if (grant.state === 'connected') {
    return 'Connected';
  }
  if (now.value >= grant.connectDeadline) {
    return 'Expired';
  }
  return grant.state === 'delivered' ? 'Waiting' : 'Ready';
}

function badgeClass(grant: GrantSummary) {
  if (stateLabel(grant) === 'Connected') {
    return 'bg-green-100 text-green-800';
  }
  if (stateLabel(grant) === 'Expired') {
    return 'bg-neutral-200 text-neutral-700';
  }
  return 'bg-amber-100 text-amber-900';
}
</script>
