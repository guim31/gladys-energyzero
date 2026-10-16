// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake EnergyZero API serving
// the real fixtures, a settable clock and a temporary /data, with the
// integration wired on top through createApp — the very wiring index.js uses.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';

// The integration logs its lifecycle; keep the test output readable
// (LOG_LEVEL is read on every log call). LOG_LEVEL=debug npm test shows them.
process.env.LOG_LEVEL ??= 'silent';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/energyzero/${name}`, import.meta.url), 'utf8'));

export const FIXTURES = {
  electricity: fixture('electricity-hour.json'),
  gas: fixture('gas-day.json'),
  error: fixture('error.json'),
};

/** 17 December 2025, 10:30 in Amsterdam (CET, UTC+1): the fixtures' middle day. */
export const DAY_TIME = '2025-12-17T09:30:00Z';

/**
 * A fixture answer keeping only the entries starting before `until`
 * (tomorrow not published yet, for instance).
 * @param {object} body
 * @param {string} until ISO date
 */
export function truncate(body, until) {
  const limit = new Date(until);
  const copy = structuredClone(body);
  for (const key of ['base', 'base_with_vat', 'all_in', 'all_in_with_vat']) {
    copy[key] = copy[key].filter((entry) => new Date(entry.start) < limit);
  }
  return copy;
}

/**
 * A fake EnergyZero API. `answers.electricity` / `answers.gas` are a body,
 * a function `(url) => body`, or `{ status, body }`; `answers.down` makes
 * every request fail like an unreachable host.
 */
export function createFakeApi(answers = {}) {
  const api = {
    answers: { electricity: FIXTURES.electricity, gas: FIXTURES.gas, ...answers },
    down: false,
    requests: [],
    async fetch(url, init) {
      const parsed = new URL(url);
      api.requests.push({ url: parsed, headers: init?.headers });
      if (api.down) {
        throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
      }
      const energy =
        parsed.searchParams.get('energyType') === 'ENERGY_TYPE_GAS' ? 'gas' : 'electricity';
      let answer = api.answers[energy];
      if (typeof answer === 'function') {
        answer = answer(parsed);
      }
      const { status = 200, body = answer } =
        answer && typeof answer.status === 'number' ? answer : {};
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    count(energy) {
      const param = energy === 'gas' ? 'ENERGY_TYPE_GAS' : 'ENERGY_TYPE_ELECTRICITY';
      return api.requests.filter((r) => r.url.searchParams.get('energyType') === param).length;
    },
  };
  return api;
}

/** A clock the test moves by hand. */
export function createClock(iso = DAY_TIME) {
  let current = new Date(iso).getTime();
  return {
    now: () => current,
    set(next) {
      current = new Date(next).getTime();
    },
    advance(ms) {
      current += ms;
    },
  };
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {boolean} [options.created] the user already added the device
 * @param {object} [options.answers] see createFakeApi
 * @param {string} [options.at] the clock, ISO
 * @param {boolean} [options.connect]
 * @param {string} [options.dataDir]
 */
export async function createWorld({
  config = {},
  created = true,
  answers,
  at = DAY_TIME,
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-energyzero-')),
} = {}) {
  const api = createFakeApi(answers);
  const clock = createClock(at);
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, { fetch: api.fetch, now: clock.now, timers: false, dataDir });
  const world = { gladys, api, clock, app, dataDir };
  if (created) {
    // The device as the user added it, before the integration connects.
    const { buildDevice } = await import('../../src/device.js');
    const { normalizeConfig } = await import('../../src/config.js');
    gladys.fake.devices = [buildDevice(gladys, normalizeConfig(config))];
  }
  if (connect) {
    await gladys.connect();
  }
  return world;
}

/** External id of a feature of the EnergyZero device. */
export const featureId = (gladys, key) => gladys.externalIds('prices', 'nl').feature(key);

/** The last state of a feature: a number, or the text of a text feature. */
export function last(gladys, key) {
  const id = featureId(gladys, key);
  const states = gladys.fake.states.filter((s) => s.device_feature_external_id === id);
  const state = states.at(-1);
  return state === undefined ? undefined : (state.text ?? state.state);
}
