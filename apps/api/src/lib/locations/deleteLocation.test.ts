import { describe, it, expect, vi } from 'vitest'
import { getTableName, is } from 'drizzle-orm'
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from '../../db/schema.js'

// db/index.ts throws at import without DATABASE_URL; these tests read the lists only.
vi.mock('../../db/index.js', () => ({ db: {} }))

const { DEPENDENT_TABLES, DETACHED_TABLES } = await import('./deleteLocation.js')

/** Every table with a foreign key to `locations.id`, as `table.column`. */
function referencesToLocations(): string[] {
  const out: string[] = []
  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const config = getTableConfig(value)
    for (const fk of config.foreignKeys) {
      const ref = fk.reference()
      if (ref.foreignTable !== schema.locations) continue
      for (const column of ref.columns) out.push(`${config.name}.${column.name}`)
    }
  }
  return out.sort()
}

describe('deleteLocationCascade table lists', () => {
  // No FK declares onDelete, so a table missing from both lists turns
  // DELETE /locations/:id into a foreign-key violation once it holds a row.
  it('covers every foreign key to locations, each exactly once', () => {
    const handled = [...DEPENDENT_TABLES, ...DETACHED_TABLES].map((t) => `${getTableName(t)}.location_id`).sort()
    expect(handled).toEqual(referencesToLocations())
  })

  it('finds the foreign keys it checks', () => {
    // Guards the test itself: if the schema walk found nothing, the check above
    // would pass with both lists empty.
    expect(referencesToLocations().length).toBeGreaterThanOrEqual(DEPENDENT_TABLES.length)
  })
})
