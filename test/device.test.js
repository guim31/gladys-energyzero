// -----------------------------------------------------------------------------
// The device and its states, built from the real fixtures through the whole
// wiring (fake Gladys + fake EnergyZero API).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE } from '../src/device.js';
import { createWorld, DAY_TIME, last, truncate, FIXTURES } from './helpers/world.js';

test('one device, built on the market zone, with French names by default', async () => {
  const { gladys } = await createWorld();
  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.name, 'EnergyZero');
  assert.equal(device.external_id, 'ext:test-integration:prices:nl');
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').at(-1)),
    Object.values(FEATURE),
  );
  const names = Object.fromEntries(
    device.features.map((f) => [f.external_id.split(':').at(-1), f.name]),
  );
  assert.equal(names.price_now, 'Prix actuel (€/kWh)');
  assert.equal(names.gas_price_today, 'Prix du gaz du jour (€/m³)');
  for (const feature of device.features) {
    assert.equal(feature.read_only, true, `${feature.name} is a sensor`);
  }
});

test('the states at 10:30 on 17 December 2025, all-in with VAT', async () => {
  const { gladys } = await createWorld({ at: DAY_TIME });
  assert.equal(last(gladys, FEATURE.PRICE_NOW), 0.44639); // 10:00-11:00
  assert.equal(last(gladys, FEATURE.PRICE_NEXT), 0.43954); // 11:00-12:00
  assert.equal(last(gladys, FEATURE.PRICE_AVG_TODAY), 0.3707);
  assert.equal(last(gladys, FEATURE.PRICE_MIN_TODAY), 0.22565);
  assert.equal(last(gladys, FEATURE.PRICE_MAX_TODAY), 0.45516);
  assert.equal(last(gladys, FEATURE.CHEAPEST_HOUR_TODAY), '04:00');
  assert.equal(last(gladys, FEATURE.PRICIEST_HOUR_TODAY), '09:00');
  assert.equal(last(gladys, FEATURE.PRICE_RANK_NOW), 22);
  // Gas day from 06:00: the 17 December price.
  assert.equal(last(gladys, FEATURE.GAS_PRICE_TODAY), 1.0172);
});

test('the gas price of the day changes at 06:00, not at midnight', async () => {
  const { gladys, app, clock } = await createWorld({ at: '2025-12-17T04:30:00Z' }); // 05:30
  assert.equal(last(gladys, FEATURE.GAS_PRICE_TODAY), 1.02564);
  clock.set('2025-12-17T05:00:30Z'); // 06:00
  await app.cycle();
  assert.equal(last(gladys, FEATURE.GAS_PRICE_TODAY), 1.0172);
});

test('the market price without VAT, and no gas', async () => {
  const { gladys } = await createWorld({
    config: { price_kind: 'market', include_vat: 'false', gas: false },
  });
  assert.equal(last(gladys, FEATURE.PRICE_NOW), 0.11117);
  assert.equal(last(gladys, FEATURE.PRICE_MIN_TODAY), 0.06664);
  assert.equal(last(gladys, FEATURE.GAS_PRICE_TODAY), undefined);
  const [device] = gladys.fake.discoveredDevices;
  assert.ok(!device.features.some((f) => f.external_id.endsWith(':gas_price_today')));
});

test('a changed price kind republishes every value, the device keeps its id', async () => {
  const { gladys } = await createWorld();
  const id = gladys.fake.discoveredDevices[0].external_id;
  const before = gladys.fake.states.length;
  await gladys.fake.configUpdated({ price_kind: 'market', include_vat: true });
  assert.equal(gladys.fake.discoveredDevices[0].external_id, id);
  assert.equal(last(gladys, FEATURE.PRICE_NOW), 0.13451);
  // The hours of the minimum did not change, they are sent again anyway.
  assert.equal(gladys.fake.states.length - before, 9);
});

test('nothing is published before the user adds the device, everything once added', async () => {
  const { gladys } = await createWorld({ created: false });
  assert.equal(gladys.fake.states.length, 0);
  await gladys.fake.deviceCreated(gladys.fake.discoveredDevices[0]);
  assert.equal(gladys.fake.states.length, 9);
  assert.ok(gladys.fake.widgetRefreshes.length > 0, 'the widget is nudged');
});

test('an unchanged value is not sent again within the hour', async () => {
  const { gladys, app, clock } = await createWorld();
  const before = gladys.fake.states.length;
  clock.advance(60 * 1000);
  await app.cycle();
  assert.equal(gladys.fake.states.length, before);
  // The next hour: the current and next prices and the rank move.
  clock.set('2025-12-17T10:00:30Z');
  await app.cycle();
  const ids = gladys.fake.states
    .slice(before)
    .map((s) => s.device_feature_external_id.split(':').at(-1));
  assert.deepEqual(ids.sort(), ['price_next', 'price_now', 'price_rank_now']);
});

test("at 23:30 the next hour is tomorrow's, when it is published", async () => {
  const late = '2025-12-17T22:30:00Z';
  const { gladys } = await createWorld({ at: late });
  assert.equal(last(gladys, FEATURE.PRICE_NEXT), 0.24307);

  const early = await createWorld({
    at: late,
    answers: { electricity: truncate(FIXTURES.electricity, '2025-12-17T23:00:00Z') },
  });
  assert.equal(last(early.gladys, FEATURE.PRICE_NEXT), undefined);
  assert.equal(last(early.gladys, FEATURE.PRICE_NOW), 0.24973);
});
