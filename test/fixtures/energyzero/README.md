# EnergyZero fixtures

Real answers of the public EnergyZero REST API
(`https://public.api.energyzero.nl/public/v1/prices`), copied from the test
fixtures of [`klaasnicolaas/python-energyzero`](https://github.com/klaasnicolaas/python-energyzero)
(MIT License, Copyright (c) 2022-2026 Klaas Schoute), the library behind the
Home Assistant `energyzero` integration. Public market data: nothing personal.

| File                    | Request                                                                     | Window (market days)            |
| ----------------------- | --------------------------------------------------------------------------- | ------------------------------- |
| `electricity-hour.json` | `energyType=ENERGY_TYPE_ELECTRICITY&date=17-12-2025&interval=INTERVAL_HOUR` | 16, 17 and 18 December 2025     |
| `gas-day.json`          | `energyType=ENERGY_TYPE_GAS&date=17-12-2025&interval=INTERVAL_DAY`          | gas days from 16 December 06:00 |
| `error.json`            | a malformed `date` (HTTP 400)                                               |                                 |

Each answer carries four streams: `base` (market), `base_with_vat`, `all_in`
(market + energy tax + purchasing costs) and `all_in_with_vat`.
