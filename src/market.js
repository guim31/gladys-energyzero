// -----------------------------------------------------------------------------
// The prices the integration knows, and when to ask EnergyZero again.
//
// Two requests per refresh (electricity hourly, gas daily), each answering
// three market days. The refresh policy keeps the load on this free public
// API as low as the use allows:
//   - once an hour;
//   - every 15 minutes from 14:00 (Amsterdam) while tomorrow's electricity
//     prices are missing: they are published between 14:00 and 15:00 and the
//     scenes and the widget want them soon after;
//   - after a failure, again after 5, 10, 20, 40 then 60 minutes.
// The data of the last successful refresh stays in use while a refresh
// fails: prices are known a day ahead, an hour without the API changes
// nothing for the current price.
// -----------------------------------------------------------------------------

import { fetchPrices, STREAMS } from './energyzero.js';
import { priceStream } from './config.js';
import { rankOf, slotAfter, slotAt, slotsOfDay, summarize } from './prices.js';
import { addDays, apiDate, marketDay, marketHour } from './time.js';

const MINUTE = 60 * 1000;
export const REFRESH_MS = 60 * MINUTE;
export const TOMORROW_RETRY_MS = 15 * MINUTE;
export const TOMORROW_FROM_HOUR = 14;
const FAILURE_BACKOFF_MS = [5, 10, 20, 40, 60].map((minutes) => minutes * MINUTE);

/**
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 */
export function createMarket({ fetch = globalThis.fetch, now = () => Date.now() } = {}) {
  const emptyStreams = () => Object.fromEntries(STREAMS.map((stream) => [stream, []]));
  const data = { electricity: emptyStreams(), gas: emptyStreams() };
  let lastSuccessAt = null;
  let lastAttemptAt = null;
  let failures = 0;
  // Whether the last successful refresh asked for gas: the user may just
  // have turned it on.
  let gasFetched = false;
  // Bumped when a refresh brings prices that differ from the known ones.
  let version = 0;

  /** Whether a refresh is due at `at`, and why (for the debug log). */
  function dueReason(at, { gas }) {
    if (lastAttemptAt !== null && failures > 0) {
      const wait = FAILURE_BACKOFF_MS[Math.min(failures, FAILURE_BACKOFF_MS.length) - 1];
      return at - lastAttemptAt >= wait ? 'retry after a failure' : null;
    }
    if (lastSuccessAt === null) {
      return 'first refresh';
    }
    if (gas && !gasFetched) {
      return 'gas prices enabled';
    }
    if (at - lastSuccessAt >= REFRESH_MS) {
      return 'hourly refresh';
    }
    const today = marketDay(new Date(at));
    if (
      !hasDay(data.electricity, addDays(today)) &&
      marketHour(new Date(at)) >= TOMORROW_FROM_HOUR &&
      at - lastAttemptAt >= TOMORROW_RETRY_MS
    ) {
      return "waiting for tomorrow's prices";
    }
    return null;
  }

  return {
    get version() {
      return version;
    },
    get lastSuccessAt() {
      return lastSuccessAt;
    },
    get failing() {
      return failures > 0;
    },

    /**
     * @param {{ gas: boolean }} config
     * @returns {string | null} why a refresh is due now, or null
     */
    dueReason(config) {
      return dueReason(now(), config);
    },

    /**
     * Read the prices of the market days around today.
     * @param {{ gas: boolean }} config
     * @throws {import('./energyzero.js').EnergyZeroError} data kept as it was
     */
    async refresh(config) {
      const at = now();
      lastAttemptAt = at;
      const day = apiDate(marketDay(new Date(at)));
      try {
        const [electricity, gas] = await Promise.all([
          fetchPrices({ energy: 'electricity', day, fetch }),
          config.gas ? fetchPrices({ energy: 'gas', day, fetch }) : Promise.resolve(data.gas),
        ]);
        const changed =
          fingerprint(electricity) !== fingerprint(data.electricity) ||
          fingerprint(gas) !== fingerprint(data.gas);
        data.electricity = electricity;
        data.gas = gas;
        lastSuccessAt = at;
        gasFetched = config.gas;
        failures = 0;
        if (changed) {
          version += 1;
        }
        return { changed };
      } catch (err) {
        failures += 1;
        throw err;
      }
    },

    /**
     * Everything the device, the widget and the triggers show, at `at`, in
     * the price stream of the configuration.
     * @param {ReturnType<import('./config.js').normalizeConfig>} config
     * @param {Date} [at]
     */
    snapshot(config, at = new Date(now())) {
      const slots = data.electricity[priceStream(config)];
      const today = marketDay(at);
      const todaySlots = slotsOfDay(slots, today);
      const current = slotAt(slots, at);
      const gasSlots = data.gas[priceStream(config)];
      return {
        at,
        today,
        current,
        next: current ? slotAfter(slots, current) : null,
        rank: current && todaySlots.includes(current) ? rankOf(todaySlots, current) : null,
        todaySlots,
        todaySummary: summarize(todaySlots),
        tomorrowSlots: slotsOfDay(slots, addDays(today)),
        gas: config.gas ? slotAt(gasSlots, at) : null,
      };
    },
  };
}

function hasDay(streams, day) {
  return slotsOfDay(streams.all_in_with_vat, day).length > 0;
}

function fingerprint(streams) {
  return JSON.stringify(
    STREAMS.map((stream) => streams[stream].map((slot) => [slot.start.getTime(), slot.price])),
  );
}
