import { defineNitroPlugin } from 'nitropack/runtime';

import { connect } from '#db/sqlite';
import { getDatabase, setDatabase } from '#db';
import * as vpn from '#server/features/vpn/lifecycle';
import { startMaintenance } from '#server/jobs/maintenance';
import { RELEASE, WG_ENV, assertOidcConfigured } from '#server/utils/config';

export default defineNitroPlugin(async (nitroApp) => {
  console.log(`
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃   wg-easy - https://github.com/wg-easy/wg-easy   ┃
┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫
┃ wg-easy:  ${RELEASE.padEnd(38)} ┃
┃ Node:     ${process.version.padEnd(38)} ┃
┃ Platform: ${process.platform.padEnd(38)} ┃
┃ Arch:     ${process.arch.padEnd(38)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
`);
  assertOidcConfigured();
  const database = await connect({
    interfaceName: WG_ENV.WG_INTERFACE,
    disableIpv6: WG_ENV.DISABLE_IPV6,
  });
  setDatabase(database.store);
  try {
    await getDatabase().general.update({
      metricsPrometheus: WG_ENV.METRICS_ENABLED,
      metricsJson: WG_ENV.METRICS_ENABLED,
    });
    // Revoke stale grants before the interface is brought up.
    await vpn.reconcile();
    await vpn.start();
  } catch (error) {
    await vpn.stop().catch(() => {});
    database.close();
    throw error;
  }
  const stopMaintenance = startMaintenance(vpn.maintain, 15_000);
  nitroApp.hooks.hook('close', async () => {
    console.log('Shutting down');
    await stopMaintenance();
    try {
      await vpn.stop();
    } finally {
      database.close();
    }
  });
});
