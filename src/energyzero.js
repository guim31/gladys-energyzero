// -----------------------------------------------------------------------------
// EnergyZero public price API (no account, no key).
//
//   GET https://public.api.energyzero.nl/public/v1/prices
//       ?energyType=ENERGY_TYPE_ELECTRICITY|ENERGY_TYPE_GAS
//       &date=DD-MM-YYYY
//       &interval=INTERVAL_HOUR|INTERVAL_QUARTER|INTERVAL_DAY
//
// The endpoint the `energyzero` Python library (klaasnicolaas/python-energyzero,
// MIT) uses since its v5, and so the Home Assistant integration. One request
// answers a window of three market days around `date` (the day before, the
// day, the day after once published), in four price streams:
//
//   base             market price (EPEX day-ahead, NL zone), VAT excluded
//   base_with_vat    market price, VAT included
//   all_in           consumer price: market + energy tax + purchasing costs
//   all_in_with_vat  the same, VAT included: what an EnergyZero customer pays
//
// Every entry is `{ start, end, price: { value: "0.238787" } }`, the price a
// decimal string in EUR/kWh (electricity) or EUR/m³ (gas). Gas is priced per
// gas day, 06:00 to 06:00 Amsterdam time.
// -----------------------------------------------------------------------------

export const API_URL = 'https://public.api.energyzero.nl/public/v1/prices';

export const ENERGY_TYPES = {
  electricity: { param: 'ENERGY_TYPE_ELECTRICITY', interval: 'INTERVAL_HOUR' },
  gas: { param: 'ENERGY_TYPE_GAS', interval: 'INTERVAL_DAY' },
};

export const STREAMS = ['base', 'base_with_vat', 'all_in', 'all_in_with_vat'];

const USER_AGENT = 'gladys-energyzero (+https://github.com/guim31/gladys-energyzero)';

/** A failed request, with what the user can be told about it. */
export class EnergyZeroError extends Error {
  /**
   * @param {string} message
   * @param {{ kind: 'network' | 'http' | 'format', status?: number }} details
   */
  constructor(message, { kind, status }) {
    super(message);
    this.name = 'EnergyZeroError';
    this.kind = kind;
    this.status = status;
  }
}

/**
 * Read the prices of the market days around `day`.
 * @param {object} options
 * @param {'electricity' | 'gas'} options.energy
 * @param {string} options.day `DD-MM-YYYY`, the API's own format
 * @param {typeof fetch} [options.fetch]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Record<string, Array<{ start: Date, end: Date, price: number }>>>}
 *   one sorted list of slots per stream (empty when nothing is published)
 */
export async function fetchPrices({ energy, day, fetch = globalThis.fetch, timeoutMs = 15000 }) {
  const type = ENERGY_TYPES[energy];
  const url = new URL(API_URL);
  url.searchParams.set('energyType', type.param);
  url.searchParams.set('date', day);
  url.searchParams.set('interval', type.interval);

  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.cause?.code ?? err?.message);
    throw new EnergyZeroError(`EnergyZero unreachable (${reason})`, { kind: 'network' });
  }

  // 404: no price for that window (a date too far ahead): nothing published.
  if (response.status === 404) {
    return emptyStreams();
  }
  if (!response.ok) {
    throw new EnergyZeroError(`EnergyZero answered HTTP ${response.status}`, {
      kind: 'http',
      status: response.status,
    });
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new EnergyZeroError('EnergyZero sent an unreadable answer', { kind: 'format' });
  }
  return parsePrices(body);
}

/**
 * Turn an API answer into sorted slots. Unreadable entries are skipped one
 * by one: a single malformed hour must not hide the other 71.
 * @param {unknown} body
 */
export function parsePrices(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new EnergyZeroError('EnergyZero sent an unexpected answer', { kind: 'format' });
  }
  const streams = emptyStreams();
  for (const stream of STREAMS) {
    const entries = Array.isArray(body[stream]) ? body[stream] : [];
    const slots = [];
    for (const entry of entries) {
      const start = new Date(entry?.start);
      const end = new Date(entry?.end);
      const price = Number(entry?.price?.value);
      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end <= start ||
        entry?.price?.value === null ||
        entry?.price?.value === '' ||
        !Number.isFinite(price)
      ) {
        continue;
      }
      slots.push({ start, end, price });
    }
    slots.sort((a, b) => a.start - b.start);
    streams[stream] = slots;
  }
  return streams;
}

function emptyStreams() {
  return Object.fromEntries(STREAMS.map((stream) => [stream, []]));
}
