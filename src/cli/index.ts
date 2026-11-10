#!/usr/bin/env node

import { defineCommand, runMain } from 'citty';

import packageJson from '../package.json';

const main = defineCommand({
  meta: {
    name: 'wg-easy',
    version: packageJson.version,
    description: 'OIDC access portal for WireGuard',
  },
});

runMain(main);
