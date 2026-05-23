import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { logger } from '../lib/logger.js'
import { users, locations } from './schema.js'

const USER_UUID = '00000000-0000-0000-0000-000000000001'

const SEED_LOCATIONS = [
  {
    id: '00000000-0000-0000-0000-000000000011',
    name: 'Joshua Tree',
    lat: '34.0136',
    lon: '-116.1661',
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
    rock_type: 'sandstone' as const,
    aspect: 'W',
    cliff_angle: '5',
    asos_station: 'KCNY',
    asos_network: 'UT_ASOS',
  },
]

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
        is_climbing_location: true,
        rock_type: loc.rock_type,
        aspect: loc.aspect,
        cliff_angle: loc.cliff_angle,
        asos_station: loc.asos_station,
        asos_network: loc.asos_network,
      })
      .onConflictDoNothing()
  }

  logger.info('Seed complete.')
  await client.end()
}

seed().catch((err: unknown) => {
  logger.error({ err }, 'Seed failed')
  process.exit(1)
})
