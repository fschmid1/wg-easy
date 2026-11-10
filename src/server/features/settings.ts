import { createError } from 'nuxt/server';

import { isPasswordValid } from '#server/utils/password';
import { getDatabase } from '#db';

export async function authorizeMetrics(
  type: 'prometheus' | 'json',
  credentials?: { method: string; value?: string }
) {
  const config = await getDatabase().general.getMetricsConfig();
  if (config.password) {
    if (!credentials) {
      throw createError({ status: 401, statusText: 'Unauthorized' });
    }
    if (credentials.method !== 'Bearer' || !credentials.value) {
      throw createError({
        status: 401,
        statusText: 'Bearer Auth required',
      });
    }
    if (!(await isPasswordValid(credentials.value, config.password))) {
      throw createError({ status: 401, statusText: 'Incorrect token' });
    }
  }
  if (!config[type]) {
    throw createError({
      status: 400,
      statusText: 'Metrics not enabled',
    });
  }
}
