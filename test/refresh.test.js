// -----------------------------------------------------------------------------
// When the integration asks EnergyZero again, and who drives it: the
// container's own timer (Gladys#3198: the core may never call onPoll), the
// core's onPoll only as a fallback.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import { buildDevice } from '../src/device.js';
import { normalizeConfig } from '../src/config.js';
import { FEATURE } from '../src/device.js';
import { createFakeApi, createWorld, FIXTURES, last, truncate } from './helpers/world.js';

const MINUTE = 60 * 1000;

/** Run one cycle a minute from the current clock, for `minutes`. */
async function runFor(world, minutes) {
  for (let i = 0; i < minutes; i += 1) {
    world.clock.advance(MINUTE);
    await world.app.cycle();
  }
}

test('in the morning: one electricity and one gas request an hour', async () => {
  const world = await createWorld({ at: '2025-12-17T07:00:00Z' }); // 08:00
  assert.equal(world.api.count('electricity'), 1);
  assert.equal(world.api.count('gas'), 1);
  await runFor(world, 59);
  assert.equal(world.api.count('electricity'), 1);
  await runFor(world, 1);
  assert.equal(world.api.count('electricity'), 2);
  assert.equal(world.api.count('gas'), 2);
  // The day asked is the market day, in the API format.
  assert.equal(world.api.requests[0].url.searchParams.get('date'), '17-12-2025');
});

test("from 14:00, every 15 minutes until tomorrow's prices are out, then hourly again", async () => {
  const beforePublication = truncate(FIXTURES.electricity, '2025-12-17T23:00:00Z');
  const world = await createWorld({
    at: '2025-12-17T12:50:00Z', // 13:50
    answers: { electricity: beforePublication },
  });
  const nudges = world.gladys.fake.widgetRefreshes.length;
  await runFor(world, 10); // 14:00: hourly not due yet, the 15-minute rule waits for 14:05
  assert.equal(world.api.count('electricity'), 1);
  await runFor(world, 5); // 14:05
  assert.equal(world.api.count('electricity'), 2);
  await runFor(world, 15); // 14:20
  assert.equal(world.api.count('electricity'), 3);
  assert.equal(world.gladys.fake.widgetRefreshes.length, nudges, 'nothing new, no widget nudge');

  world.api.answers.electricity = FIXTURES.electricity; // published
  await runFor(world, 15); // 14:35
  assert.equal(world.api.count('electricity'), 4);
  assert.equal(world.gladys.fake.widgetRefreshes.length, nudges + 1, 'new prices nudge the widget');
  await runFor(world, 59);
  assert.equal(world.api.count('electricity'), 4, 'hourly again');
  await runFor(world, 1);
  assert.equal(world.api.count('electricity'), 5);
});

test('a failure keeps the known prices and retries after 5, 10, 20 minutes', async () => {
  const world = await createWorld();
  const price = last(world.gladys, FEATURE.PRICE_NOW);
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });

  world.api.down = true;
  await runFor(world, 60);
  const attempts = () => world.api.count('electricity');
  assert.equal(attempts(), 2);
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.en, /last known prices/);
  await runFor(world, 4);
  assert.equal(attempts(), 2);
  await runFor(world, 1);
  assert.equal(attempts(), 3);
  await runFor(world, 10);
  assert.equal(attempts(), 4);
  // The hour changed meanwhile: the current price follows the known data.
  assert.notEqual(last(world.gladys, FEATURE.PRICE_NOW), price);
  assert.equal(last(world.gladys, FEATURE.PRICE_NOW), 0.43954);

  world.api.down = false;
  await runFor(world, 20);
  assert.equal(attempts(), 5);
  assert.deepEqual(world.gladys.fake.connectionStatus, { connected: true });
  // The status is sent on a change only.
  assert.equal(world.gladys.fake.connectionStatuses.length, 3);
});

test('a day without electricity prices says so in the Configuration screen', async () => {
  const world = await createWorld({ at: '2026-10-16T10:00:00Z' });
  assert.equal(world.gladys.fake.connectionStatus.connected, false);
  assert.match(world.gladys.fake.connectionStatus.message.en, /no electricity price for today/);
  assert.equal(last(world.gladys, FEATURE.PRICE_NOW), undefined);
});

test('turning gas on reads the gas price at once', async () => {
  const world = await createWorld({ config: { gas: false } });
  assert.equal(world.api.count('gas'), 0);
  await world.gladys.fake.configUpdated({ gas: true });
  assert.equal(world.api.count('gas'), 1);
  assert.equal(last(world.gladys, FEATURE.GAS_PRICE_TODAY), 1.0172);
  assert.ok(
    world.gladys.fake.discoveredDevices[0].features.some((f) =>
      f.external_id.endsWith(':gas_price_today'),
    ),
  );
});

test('the "Refresh now" action reads EnergyZero and reports what it got', async () => {
  const world = await createWorld();
  const ack = await world.gladys.fake.action('refresh');
  assert.equal(ack.success, true);
  assert.equal(world.api.count('electricity'), 2);
  assert.match(ack.data.message.en, /24 hours today, 24 hours tomorrow/);
  assert.match(ack.data.message.fr, /Prix actuel : 0,446 €\/kWh/);
  assert.match(ack.data.message.en, /Gas today: 1,017 €\/m³/);

  world.api.down = true;
  const failed = await world.gladys.fake.action('refresh');
  assert.equal(failed.success, true);
  assert.match(failed.data.message.de, /nicht erreichbar \(EnergyZero unreachable \(ENOTFOUND\)\)/);
});

test('the states refresh on the container timer alone, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date('2025-12-17T09:58:00Z') });
  const api = createFakeApi();
  const gladys = createFakeGladys({});
  gladys.fake.devices = [buildDevice(gladys, normalizeConfig())];
  t.mock.method(gladys, 'onPoll', () => {});
  const app = createApp(gladys, {
    fetch: api.fetch,
    dataDir: mkdtempSync(join(tmpdir(), 'gladys-energyzero-')),
  });
  await gladys.connect();
  assert.equal(last(gladys, FEATURE.PRICE_NOW), 0.44639); // 10:00-11:00

  // Two minutes later, 11:00 in Amsterdam: the timer alone moves the price.
  for (let i = 0; i < 3; i += 1) {
    t.mock.timers.tick(MINUTE);
    for (let j = 0; j < 20; j += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  assert.equal(last(gladys, FEATURE.PRICE_NOW), 0.43954);
  assert.equal(gladys.onPoll.mock.callCount(), 1, 'replaced by a mock: the core could not call it');
  app.stop();
});

test("the core's onPoll runs a cycle only when the timer missed one", async () => {
  const world = await createWorld();
  const device = world.gladys.fake.discoveredDevices[0];
  const before = world.api.requests.length;
  world.clock.advance(MINUTE);
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  // A minute after the last cycle: skipped (it would not read anything anyway).
  world.clock.advance(61 * MINUTE);
  assert.deepEqual(await world.gladys.fake.poll(device), { success: true });
  assert.equal(world.api.requests.length, before + 2, 'the stalled timer is replaced');
});
