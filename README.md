# EnergyZero for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) integration for the **dynamic
electricity and gas prices of the Netherlands** published by
[EnergyZero](https://www.energyzero.nl): the price of the current hour, the
cheapest hours of the day, a chart of today and tomorrow, and scene triggers to run
appliances when electricity is cheapest. No account, no API key.

Developed without access to the live API from the development environment (it is
tested on real recorded answers): feedback welcome.

## Features

- **One device, read-only**: current price, next hour price, average, lowest and
  highest price of the day with the hour of the lowest and of the highest, rank of
  the current hour (1 = cheapest), gas price of the day. €/kWh and €/m³.
- **Price kind**: the all-in consumer price (market price + energy tax + purchasing
  costs, what an EnergyZero customer pays) or the EPEX day-ahead market price of the
  NL zone, with or without VAT.
- **Dashboard widget** "Electricity prices": tiles for now, next hour and today's
  average, a step chart of today and tomorrow with the minimum and maximum marked,
  the cheapest hours and the gas price.
- **Scene triggers**: "Cheapest hours of the day begin" (the cheapest run of 1 to 8
  consecutive hours — to start a dishwasher once) and "One of the cheapest hours
  begins" (each of the N cheapest hours — for a boiler, a charger).
- Feature names and widget in English, French, German and Spanish.

Compared with a Nord Pool integration (raw day-ahead market price of a bidding zone,
taxes excluded), EnergyZero adds the Dutch **consumer price** and the **gas price**;
its market price is the same EPEX NL market.

## Requirements

- Gladys Assistant **5.1.0** or later.
- Internet access from Gladys to `public.api.energyzero.nl`.

## Installation

In Gladys: **Integrations → Install from GitHub**, enter
`https://github.com/guim31/gladys-energyzero`. Then add the EnergyZero device from
the **Discovery** tab, and the "Electricity prices" widget on a dashboard.

The user documentation, in four languages, is in [`docs/`](docs/en.md).

## How it works

The container reads `GET https://public.api.energyzero.nl/public/v1/prices` (the
endpoint the `energyzero` Python library uses since its v5): electricity hourly and
gas daily, three market days per answer. It asks once an hour, every 15 minutes from
14:00 until tomorrow's prices are out, and backs off after a failure; the last known
prices stay in use meanwhile. A timer in the container refreshes the states every
minute (the core's `onPoll` is only a fallback, Gladys#3198), publishes only what
changed (plus a 6-hour heartbeat) and fires the scene triggers when an hour begins.
A day is a market day of Europe/Amsterdam, whatever the timezone of Gladys.

## Limitations

- Hourly prices only (the market trades quarter hours since October 2025).
- The Netherlands only, EnergyZero prices: another supplier's markup differs.
- The triggers consider the current day only: a cheapest run never spans midnight.
- Read-only: the integration controls nothing.

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test, against the SDK's fake Gladys and a fake API
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store .   # store validator
node scripts/probe.mjs                            # the real prices of today (network)
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/app.js            refresh cycle, states, scene events, action, widget, lifecycle
src/energyzero.js     client of the public price API
src/market.js         known prices and refresh policy
src/prices.js         pure computations (current, rank, cheapest window...)
src/device.js         the device and its states
src/triggers.js       scene events of an hour that begins
src/widget.js         the "Electricity prices" widget
src/ledger.js         hours whose scene events are out, kept in /data
src/time.js           the Amsterdam market clock
src/i18n.js           every user-facing text, four languages
test/fixtures/        real API answers (python-energyzero), Gladys feature table
```

To run it outside Gladys:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="energyzero" \
ENERGYZERO_DATA_DIR=./data \
npm start
```

Releases are made by the **Release** workflow (Actions → Release); never edit
the versions by hand. A hand-pushed `vX.Y.Z` tag also builds the image and the
GitHub Release, but then `version` in `package.json` and in the manifest (with
the `docker_image` tag) must be bumped and committed before tagging. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [python-energyzero](https://github.com/klaasnicolaas/python-energyzero) by Klaas
  Schoute (MIT): the API endpoint, its streams and the test fixtures in
  `test/fixtures/energyzero/` are its real recorded answers.
- Home Assistant's
  [`energyzero`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/energyzero)
  integration (Apache-2.0): the set of sensors (current, next, average, min, max,
  hour of min and max, gas).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by EnergyZero.
"EnergyZero" is a trademark of its owner. The prices are informational: check your
contract.

## License

[Apache-2.0](LICENSE)
