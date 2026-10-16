// -----------------------------------------------------------------------------
// The scene triggers: which events go out when an hour begins, once.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrices } from '../src/energyzero.js';
import { slotsOfDay } from '../src/prices.js';
import { eventsForSlot, TRIGGER } from '../src/triggers.js';
import { createWorld, FIXTURES } from './helpers/world.js';

const day = slotsOfDay(parsePrices(FIXTURES.electricity).all_in_with_vat, '2025-12-17');
const at = (hour) => day[hour]; // the slot starting at hour:00 in Amsterdam
const summary = (events) => events.map((e) => `${e.key}:${e.data.hours}`);

test('04:00, the cheapest hour of 17 December: every "N cheapest hours" and the 1-hour window', () => {
  const events = eventsForSlot(day, at(4));
  assert.deepEqual(summary(events), [
    'cheapest_window_started:1',
    'cheapest_window_started:2',
    'cheap_hour_started:1',
    'cheap_hour_started:2',
    'cheap_hour_started:3',
    'cheap_hour_started:4',
    'cheap_hour_started:5',
    'cheap_hour_started:6',
    'cheap_hour_started:8',
    'cheap_hour_started:10',
    'cheap_hour_started:12',
  ]);
  assert.deepEqual(events[0].data, {
    hours: '1',
    average_price: 0.22565,
    start_time: '04:00',
    end_time: '05:00',
  });
  assert.deepEqual(events[2].data, {
    hours: '1',
    rank: 1,
    price: 0.22565,
    start_time: '04:00',
    end_time: '05:00',
  });
});

test('the longer windows begin earlier, the night is cheap from 00:00', () => {
  const started = (hour) =>
    eventsForSlot(day, at(hour))
      .filter((e) => e.key === TRIGGER.CHEAPEST_WINDOW)
      .map((e) => Number(e.data.hours));
  const byHour = Object.fromEntries(
    day.map((_, hour) => [hour, started(hour)]).filter(([, list]) => list.length > 0),
  );
  // Each N begins exactly once a day: 3 and 4 hours from 03:00, 8 from 00:00.
  assert.deepEqual(byHour, { 0: [8], 1: [6], 2: [5], 3: [3, 4], 4: [1, 2] });
  const three = eventsForSlot(day, at(3)).find((e) => e.key === TRIGGER.CHEAPEST_WINDOW);
  assert.equal(three.data.start_time, '03:00');
  assert.equal(three.data.end_time, '06:00');
});

test('09:00, the most expensive hour, fires nothing', () => {
  assert.deepEqual(eventsForSlot(day, at(9)), []);
  // A slot of another day is never compared with this one.
  assert.deepEqual(eventsForSlot(day.slice(1), at(0)), []);
});

test('each N cheapest hours fires exactly N times a day', () => {
  const counts = {};
  for (const slot of day) {
    for (const event of eventsForSlot(day, slot)) {
      if (event.key === TRIGGER.CHEAP_HOUR) {
        counts[event.data.hours] = (counts[event.data.hours] ?? 0) + 1;
      }
    }
  }
  assert.deepEqual(counts, { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 8: 8, 10: 10, 12: 12 });
});

test('the events go out when the hour begins, once, even across a restart', async () => {
  const world = await createWorld({ at: '2025-12-17T02:59:30Z' }); // 03:59:30
  const before = world.gladys.fake.sceneEvents.length;
  world.clock.set('2025-12-17T03:00:02Z');
  await world.app.cycle();
  const fired = world.gladys.fake.sceneEvents.length - before;
  assert.equal(fired, 11);
  world.clock.set('2025-12-17T03:01:02Z');
  await world.app.cycle();
  assert.equal(world.gladys.fake.sceneEvents.length - before, 11, 'once');

  // The container restarts at 04:02 with the same /data: nothing again.
  const restarted = await createWorld({ at: '2025-12-17T03:02:00Z', dataDir: world.dataDir });
  assert.equal(restarted.gladys.fake.sceneEvents.length, 0);
});

test('an hour that began more than 10 minutes ago fires nothing', async () => {
  const world = await createWorld({ at: '2025-12-17T03:11:00Z' }); // 04:11
  assert.deepEqual(world.gladys.fake.sceneEvents, []);
  const onTime = await createWorld({ at: '2025-12-17T03:09:00Z' });
  assert.equal(onTime.gladys.fake.sceneEvents.length, 11);
});

test('a refused event is sent again on the next cycle, the others are not duplicated', async (t) => {
  const world = await createWorld({ at: '2025-12-17T02:59:30Z' });
  const original = world.gladys.publishSceneEvent.bind(world.gladys);
  let calls = 0;
  t.mock.method(world.gladys, 'publishSceneEvent', async (key, data) => {
    calls += 1;
    if (calls === 3) {
      throw new Error('429 TOO_MANY_REQUESTS');
    }
    return original(key, data);
  });
  world.clock.set('2025-12-17T03:00:02Z');
  await world.app.cycle();
  assert.equal(world.gladys.fake.sceneEvents.length, 2);
  world.clock.set('2025-12-17T03:01:02Z');
  await world.app.cycle();
  const sent = world.gladys.fake.sceneEvents.map((e) => `${e.key}:${e.data.hours}`);
  assert.equal(sent.length, 11);
  assert.equal(new Set(sent).size, 11);
});
