/**
 * `tsx --import` entry for CI's database checks: points the driver at the
 * throwaway Postgres before a script's first import of `../db/index.js`, so the
 * `check:*` scripts run unchanged. A no-op without `CHECK_UI_WS_PROXY`.
 */

import { useLocalPostgresProxy } from './localPostgres.js'

await useLocalPostgresProxy()
