// -----------------------------------------------------------------------------
// Read the real EnergyZero prices of today, read-only, through the client the
// integration uses — to run from a machine that has the network:
//
//   node scripts/probe.mjs [YYYY-MM-DD]
//
// No account, no key, nothing sensitive: public market prices. It also tries
// the legacy endpoint (api.energyzero.nl/v1/energyprices) to know whether it
// still answers, for the record.
// -----------------------------------------------------------------------------

import { fetchPrices, STREAMS } from '../src/energyzero.js';
import { slotAt, slotsOfDay, summarize } from '../src/prices.js';
import { addDays, apiDate, marketDay, marketTime } from '../src/time.js';

const today = process.argv[2] ?? marketDay(new Date());
const day = apiDate(today);
let failed = false;

for (const energy of ['electricity', 'gas']) {
  try {
    const started = Date.now();
    const streams = await fetchPrices({ energy, day });
    console.log(`\n${energy} (${Date.now() - started} ms), date=${day}`);
    for (const stream of STREAMS) {
      const slots = streams[stream];
      const todaySlots = slotsOfDay(slots, today);
      const tomorrow = slotsOfDay(slots, addDays(today));
      const summary = summarize(todaySlots);
      const current = slotAt(slots, new Date());
      console.log(
        `  ${stream.padEnd(16)} ${String(slots.length).padStart(3)} slots, ` +
          `today ${todaySlots.length}, tomorrow ${tomorrow.length}` +
          (summary
            ? `, avg ${summary.average.toFixed(4)}, min ${summary.min.price} at ${marketTime(summary.min.start)}` +
              `, max ${summary.max.price} at ${marketTime(summary.max.start)}`
            : '') +
          (current ? `, now ${current.price}` : ''),
      );
    }
  } catch (err) {
    failed = true;
    console.log(`\n${energy}: FAILED (${err.kind ?? 'error'}) ${err.message}`);
  }
}

// The legacy endpoint the older library versions used.
try {
  const from = new Date(`${today}T00:00:00Z`);
  const url = new URL('https://api.energyzero.nl/v1/energyprices');
  url.searchParams.set('fromDate', new Date(from.getTime() - 2 * 3600000).toISOString());
  url.searchParams.set('tillDate', new Date(from.getTime() + 22 * 3600000 - 1).toISOString());
  url.searchParams.set('interval', '4');
  url.searchParams.set('usageType', '1');
  url.searchParams.set('inclBtw', 'true');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const body = response.ok ? await response.json() : null;
  console.log(
    `\nlegacy v1/energyprices: HTTP ${response.status}` +
      (body ? `, ${body.Prices?.length ?? 0} prices, average ${body.average}` : ''),
  );
} catch (err) {
  console.log(`\nlegacy v1/energyprices: ${err.message}`);
}

process.exitCode = failed ? 1 : 0;
