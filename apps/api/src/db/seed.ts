import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { logger } from '../lib/logger.js'
import { users, locations, crags } from './schema.js'
import { or, eq } from 'drizzle-orm'

const USER_UUID = '00000000-0000-0000-0000-000000000001'

const SEED_LOCATIONS = [
  {
    id: '00000000-0000-0000-0000-000000000011',
    name: 'Joshua Tree',
    lat: '34.0136',
    lon: '-116.1661',
    elevation_m: '1240',
    rock_type: 'granite' as const,
    aspect: 'S',
    cliff_angle: '30',
    asos_station: 'KPSP',
    asos_network: 'CA_ASOS',
  },
  {
    id: '00000000-0000-0000-0000-000000000012',
    name: 'Red Rock',
    lat: '36.1354',
    lon: '-115.4265',
    elevation_m: '940',
    rock_type: 'limestone' as const,
    aspect: 'E',
    cliff_angle: '10',
    asos_station: 'KLAS',
    asos_network: 'NV_ASOS',
  },
  {
    id: '00000000-0000-0000-0000-000000000013',
    name: 'Indian Creek',
    lat: '37.9058',
    lon: '-109.8019',
    elevation_m: '1490',
    rock_type: 'sandstone' as const,
    aspect: 'W',
    cliff_angle: '5',
    asos_station: 'KCNY',
    asos_network: 'UT_ASOS',
  },
]

function toRockType(
  v: string | null | undefined,
): 'sandstone' | 'limestone' | 'granite' | 'basalt' | 'unknown' {
  const valid = ['sandstone', 'limestone', 'granite', 'basalt'] as const
  if (valid.includes(v as (typeof valid)[number])) return v as (typeof valid)[number]
  return 'unknown'
}

async function seed(): Promise<void> {
  const url = process.env['DATABASE_URL']
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const client = postgres(url)
  const db = drizzle(client)

  logger.info('Seeding user…')
  await db
    .insert(users)
    .values({ id: USER_UUID, name: 'Admin' })
    .onConflictDoNothing()

  logger.info('Seeding locations…')
  for (const loc of SEED_LOCATIONS) {
    await db
      .insert(locations)
      .values({
        id: loc.id,
        user_id: USER_UUID,
        name: loc.name,
        lat: loc.lat,
        lon: loc.lon,
        elevation_m: loc.elevation_m,
        is_climbing_location: true,
        rock_type: loc.rock_type,
        aspect: loc.aspect,
        cliff_angle: loc.cliff_angle,
        asos_station: loc.asos_station,
        asos_network: loc.asos_network,
      })
      .onConflictDoNothing()
  }

  // Seed MN/WI crags from the crags reference table as climbing locations.
  // Requires importCrags.ts to have been run first with MN/WI OpenBeta data.
  const mnwiCrags = await db
    .select()
    .from(crags)
    .where(or(eq(crags.state, 'MN'), eq(crags.state, 'WI')))

  if (mnwiCrags.length > 0) {
    // Pre-fetch existing location names to avoid duplicate inserts (locations has no unique-name constraint)
    const existingLocations = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.user_id, USER_UUID))
    const existingNames = new Set(existingLocations.map((r) => r.name))

    const toInsert = mnwiCrags.filter((c) => !existingNames.has(c.name))

    if (toInsert.length > 0) {
      await db.insert(locations).values(
        toInsert.map((crag) => ({
          user_id: USER_UUID,
          name: crag.name,
          lat: crag.lat,
          lon: crag.lon,
          is_climbing_location: true,
          rock_type: toRockType(crag.rock_type),
        })),
      )
      logger.info(`Seeded ${toInsert.length} MN/WI climbing locations`)
    } else {
      logger.info('MN/WI locations already seeded — skipping')
    }
  } else {
    logger.info('No MN/WI crags found in crags table — run importCrags.ts first')
  }

  logger.info('Seed complete.')
  await client.end()
}

seed().catch((err: unknown) => {
  logger.error({ err }, 'Seed failed')
  process.exit(1)
})
