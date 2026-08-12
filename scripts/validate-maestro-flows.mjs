#!/usr/bin/env node
/**
 * Assert required Maestro flow files exist and parse as YAML-ish documents.
 * Used by `pnpm test:e2e:validate` and CI (no Maestro CLI required).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const maestroDir = join(root, 'maestro');

/** Suite entry points + shared pieces the default run depends on. */
const REQUIRED = [
  'config.yaml',
  'smoke-unauth.yaml',
  'smoke-shell.yaml',
  'suite-shared.yaml',
  'flow-wellness-save.yaml',
  'flow-recommendation-accept.yaml',
  'subflows/boot-and-login.yaml',
  'subflows/reset-to-today.yaml',
  'subflows/connect-dev-client.yaml',
  'subflows/e2e-login.yaml',
  'subflows/tap-tab-more.yaml',
  'subflows/dismiss-dev-menu.yaml',
  'scenarios/shell-tabs.yaml',
  'scenarios/today-recommendation.yaml',
  'scenarios/today-athlete.yaml',
  'scenarios/log-checkin-open.yaml',
  'scenarios/log-meal-open.yaml',
  'scenarios/coach-compose.yaml',
  'scenarios/more-hubs.yaml',
  'scenarios/more-invite.yaml',
  'scenarios/more-subscription.yaml',
  'scenarios/settings-account-deletion.yaml',
  'scenarios/deeplink-today.yaml',
  'scenarios/deeplink-log.yaml',
  'scenarios/deeplink-coach.yaml',
  'standalone/flow-today-recommendation.yaml',
  'standalone/flow-today-athlete.yaml',
  'standalone/flow-log-checkin-open.yaml',
  'standalone/flow-log-meal-open.yaml',
  'standalone/flow-coach-compose.yaml',
  'standalone/flow-more-hubs.yaml',
  'standalone/flow-more-invite.yaml',
  'standalone/flow-more-subscription.yaml',
  'standalone/flow-deeplink-today.yaml',
  'standalone/flow-deeplink-log.yaml',
  'standalone/flow-deeplink-coach.yaml',
];

const APP_ID = 'com.coachwatts.app';

function fail(message) {
  console.error(`validate-maestro-flows: ${message}`);
  process.exit(1);
}

if (!existsSync(maestroDir)) {
  fail(`missing directory ${maestroDir}`);
}

function listYaml(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listYaml(join(dir, entry.name), rel));
    } else if (entry.name.endsWith('.yaml')) {
      out.push(rel);
    }
  }
  return out;
}

const onDisk = new Set(listYaml(maestroDir));

for (const name of REQUIRED) {
  if (!onDisk.has(name)) {
    fail(`missing required flow: maestro/${name}`);
  }
}

for (const name of onDisk) {
  const path = join(maestroDir, name);
  const text = readFileSync(path, 'utf8');
  if (!text.includes(`appId: ${APP_ID}`)) {
    fail(`${name}: expected appId: ${APP_ID}`);
  }
  // config.yaml has no --- document separator
  if (name !== 'config.yaml' && !text.includes('---')) {
    fail(`${name}: expected Maestro document separator ---`);
  }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('\t')) {
      fail(`${name}:${i + 1}: tabs are not allowed (use spaces)`);
    }
  }
}

const suiteShared = readFileSync(join(maestroDir, 'suite-shared.yaml'), 'utf8');
if (!suiteShared.includes('subflows/boot-and-login.yaml')) {
  fail('suite-shared.yaml: expected boot-and-login once at start');
}
if ((suiteShared.match(/clearState:\s*true/g) || []).length > 0) {
  fail('suite-shared.yaml: must not clearState (use boot-and-login only)');
}

const isolated = [
  'smoke-unauth.yaml',
  'flow-wellness-save.yaml',
  'flow-recommendation-accept.yaml',
];
for (const name of isolated) {
  const text = readFileSync(join(maestroDir, name), 'utf8');
  if (!text.includes('isolated') && name !== 'smoke-unauth.yaml') {
    // tags block
  }
  if (name === 'smoke-unauth.yaml' && !text.includes('clearKeychain: true')) {
    fail(`${name}: isolated unauth must clearKeychain`);
  }
  if (name.startsWith('flow-') && !text.includes('boot-and-login.yaml')) {
    fail(`${name}: isolated mutation must boot-and-login`);
  }
}

console.log(
  `validate-maestro-flows: ok (${REQUIRED.length} required, ${onDisk.size} yaml on disk)`,
);
