// -----------------------------------------------------------------------------
// The EnergyZero client, against the real answers of the API (fixtures of
// python-energyzero) and a fake fetch: never the network.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnergyZeroError, fetchPrices, parsePrices, STREAMS } from '../src/energyzero.js';
import { createFakeApi, FIXTURES } from './helpers/world.js';

test('the hourly answer gives 72 hours in each of the four streams', () => {
  const streams = parsePrices(FIXTURES.electricity);
  assert.deepEqual(Object.keys(streams), STREAMS);
  for (const stream of STREAMS) {
    assert.equal(streams[stream].length, 72, stream);
  }
  const [first] = streams.all_in_with_vat;
  assert.equal(first.start.toISOString(), '2025-12-15T23:00:00.000Z');
  assert.equal(first.end.toISOString(), '2025-12-16T00:00:00.000Z');
  assert.equal(first.price, 0.238787);
  assert.equal(streams.base[0].price, 0.077495);
  // VAT: 21 % on the market price (EnergyZero rounds its own way).
  assert.ok(Math.abs(streams.base[0].price * 1.21 - streams.base_with_vat[0].price) < 1e-4);
});

test('the gas answer gives one price per gas day, from 06:00 to 06:00', () => {
  const { all_in_with_vat: gas } = parsePrices(FIXTURES.gas);
  assert.equal(gas.length, 3);
  assert.equal(gas[0].start.toISOString(), '2025-12-16T05:00:00.000Z');
  assert.equal(gas[0].end.toISOString(), '2025-12-17T05:00:00.000Z');
  assert.equal(gas[1].price, 1.0172046019388);
});

test('an unreadable entry is skipped, the others are kept and sorted', () => {
  const streams = parsePrices({
    all_in_with_vat: [
      { start: '2025-12-17T01:00:00Z', end: '2025-12-17T02:00:00Z', price: { value: '0.2' } },
      { start: 'not a date', end: '2025-12-17T02:00:00Z', price: { value: '0.2' } },
      { start: '2025-12-17T02:00:00Z', end: '2025-12-17T03:00:00Z', price: { value: 'n/a' } },
      { start: '2025-12-17T03:00:00Z', end: '2025-12-17T04:00:00Z', price: { value: null } },
      { start: '2025-12-17T03:00:00Z', end: '2025-12-17T04:00:00Z' },
      { start: '2025-12-17T00:00:00Z', end: '2025-12-17T01:00:00Z', price: { value: '-0.01' } },
    ],
  });
  assert.deepEqual(
    streams.all_in_with_vat.map((s) => s.price),
    [-0.01, 0.2],
  );
  assert.deepEqual(streams.base, []);
  assert.throws(() => parsePrices([]), EnergyZeroError);
  assert.throws(() => parsePrices(null), EnergyZeroError);
});

test('the request asks one day, hourly, and says who it is', async () => {
  const api = createFakeApi();
  await fetchPrices({ energy: 'electricity', day: '17-12-2025', fetch: api.fetch });
  await fetchPrices({ energy: 'gas', day: '17-12-2025', fetch: api.fetch });
  const [electricity, gas] = api.requests;
  assert.equal(
    electricity.url.origin + electricity.url.pathname,
    'https://public.api.energyzero.nl/public/v1/prices',
  );
  assert.deepEqual(Object.fromEntries(electricity.url.searchParams), {
    energyType: 'ENERGY_TYPE_ELECTRICITY',
    date: '17-12-2025',
    interval: 'INTERVAL_HOUR',
  });
  assert.deepEqual(Object.fromEntries(gas.url.searchParams), {
    energyType: 'ENERGY_TYPE_GAS',
    date: '17-12-2025',
    interval: 'INTERVAL_DAY',
  });
  assert.match(electricity.headers['User-Agent'], /^gladys-energyzero/);
  assert.equal(electricity.headers.Accept, 'application/json');
});

test('a 404 means nothing published, an HTTP error and a network failure are typed', async () => {
  const api = createFakeApi({ electricity: { status: 404, body: { code: 5 } } });
  const empty = await fetchPrices({ energy: 'electricity', day: '17-12-2030', fetch: api.fetch });
  assert.deepEqual(empty.all_in_with_vat, []);

  api.answers.electricity = { status: 400, body: FIXTURES.error };
  await assert.rejects(
    fetchPrices({ energy: 'electricity', day: 'bad', fetch: api.fetch }),
    (err) => err instanceof EnergyZeroError && err.kind === 'http' && err.status === 400,
  );

  api.down = true;
  await assert.rejects(
    fetchPrices({ energy: 'electricity', day: '17-12-2025', fetch: api.fetch }),
    (err) => err.kind === 'network' && /ENOTFOUND/.test(err.message),
  );

  const notJson = async () => new Response('<html>', { status: 200 });
  await assert.rejects(
    fetchPrices({ energy: 'electricity', day: '17-12-2025', fetch: notJson }),
    (err) => err.kind === 'format',
  );
});
