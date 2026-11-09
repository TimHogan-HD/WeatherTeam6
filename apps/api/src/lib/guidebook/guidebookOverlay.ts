/**
 * Boulders and problems the OpenBeta snapshot does not have, written by hand so
 * a forecast check can name the boulder it was on. **Not generated**:
 * `npm run guidebook:pull` rewrites `guidebookMn.ts` and never this file, and
 * `applyOverlay` lays it over whatever the pull brought.
 *
 * Eldon (Sandstone) is one OpenBeta area with every problem directly on it and
 * no boulders. The grouping below is the owner's, from the ground and Mountain
 * Project's approach notes (2026-11-09). A problem only on Mountain Project
 * carries its name, grade and Mountain Project id, nothing else: no write-up is
 * copied. No boulder has a point; `area_locations` is where a phone records one.
 *
 * The ids are fixed UUIDs minted once for this file. **Never change one**: a
 * saved forecast check or tick names it.
 */
import type { GuidebookRoute } from '@weatherteam6/types'

export type OverlayArea = {
  id: string
  name: string
  /** The OpenBeta area this one sits inside. */
  parent: string
  /** OpenBeta routes, now directly on `parent`, that are on this boulder. */
  route_ids: string[]
  /** Problems OpenBeta does not have at all. */
  routes: GuidebookRoute[]
}

/** OpenBeta's Eldon, under Sandstone › Sandstone Bouldering. */
export const ELDON = '7a0e7bc3-67bd-56a9-82d3-cb4d4321b9d5'

function mpOnly(id: string, name: string, vscale: string, mpId: string): GuidebookRoute {
  return {
    id,
    name,
    yds: null,
    french: null,
    vscale,
    kinds: ['boulder'],
    first_ascent: null,
    safety: null,
    left_right: null,
    mp_id: mpId,
    description: null,
  }
}

export const GUIDEBOOK_OVERLAY: readonly OverlayArea[] = [
  {
    id: '32484a0a-74ef-4540-9016-962b86fad8f3',
    name: 'River Boulder (Beach Boulder)',
    parent: ELDON,
    route_ids: [
      '36885089-4ed7-5e9f-8d43-39c1dc43081d', // Panic Arete
      'a9fa4d4b-57da-5155-b264-af83e43c7339', // The Nervous Addition
      '99bae445-a12d-5cfd-8245-7cadba8cbd4a', // All for V4
      'ed75daa7-6424-56ec-a135-b0be158cd7f5', // All for V6
      'b8587e89-8b20-5161-b250-eab1a5401b02', // All For Panic
      'c617a97f-60f9-52db-9b3e-eec18bcad4cc', // The Nose Thing
      '98037704-745c-511e-94b6-4fe4f4f69bf0', // Best Boulder in Minnesota
      '1d10b953-3f28-538e-b01e-b881f0428896', // Last Touch
      'cda1a18a-6d7e-5e59-876f-a0f5c054aa92', // Invisible Touch
      '047e5dd1-9e82-5460-97e6-3e92ae461445', // Best Touch
    ],
    routes: [
      mpOnly('d48db849-1bd3-4d50-b238-5e2ca42e154d', "Blind Man's Path", 'V3-4', '202674788'),
      mpOnly('9b5d5eef-a656-43d2-aaf5-965a72c5b959', 'nicotine eyes', 'V5', '127277321'),
      mpOnly('2b2c2709-2511-4ddf-951e-a3f407b44038', 'Cold Day in Hell', 'V10', '201876848'),
    ],
  },
  {
    id: '38527b42-e27a-41d2-8127-02a84b46c679',
    name: 'Riverside Boulder',
    parent: ELDON,
    route_ids: [
      'd706ae7b-eff0-59ff-b7c0-651d4c8e4abf', // Riverside V4
      'b3d7bf99-ccf2-589d-a4c2-a40ef958f62f', // Riverside Direct
      'b24fe81e-35ae-59ee-9fec-43e84a533ed4', // Riverside Jump or Swim
    ],
    routes: [],
  },
  {
    id: 'f3c1c750-a85f-4b0e-88a5-f3cde00bc039',
    name: 'On Ice Boulder (upriver)',
    parent: ELDON,
    route_ids: [
      '1483286a-2f50-5a8b-9ae1-0645deac327e', // On Ice
    ],
    routes: [],
  },
  {
    id: 'e97fff1c-f9f0-48a6-9338-0a1551cd822c',
    name: "Mike's Lunge Boulder",
    parent: ELDON,
    route_ids: [
      'eff345e3-c734-50a9-8c8a-ef1850df62f0', // Mike's Lunge
    ],
    routes: [
      mpOnly('86b01a93-1ad8-41a3-b518-53f1197e1b85', 'Star Chaser', 'V3', '125365593'),
    ],
  },
  {
    id: 'dccf7801-a295-4b24-b114-4ea03213aee2',
    name: 'Helke Arete Boulder',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('f841db4e-4e8e-4baa-b1b0-198a15bab068', 'Helke Arete', 'V1', '122213901'),
    ],
  },
  {
    id: 'adae316c-880f-479a-a99e-224dae4baa57',
    name: 'Tengo Boulder',
    parent: ELDON,
    route_ids: [
      '3739d08d-8a40-5e2d-8989-8c9190b04243', // Tengo De La Muerte
      '765b143f-c21a-546b-bace-d1e9a115d8f7', // Lean With It, Rock With It
      '562009aa-36cf-5e6d-ae2e-d6a1999f732f', // Rock Wid It
    ],
    routes: [
      mpOnly('ca5f24b7-05e3-4095-8b4c-f4b9e0cafdbf', "It's Not a Tufa", 'V1', '123432226'),
    ],
  },
  {
    id: '8f34277d-e30c-4fea-bb21-7a947a1d0b9b',
    name: 'Cliffline north of Tengo',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('672ee9ed-5632-44f4-8df5-ff3c7fe06cb9', 'Cliffline Left', 'V1', '125790388'),
    ],
  },
  {
    id: 'ada1716b-e46f-4ee5-b747-085802ba669f',
    name: "That Girl's a Bitch Slab",
    parent: ELDON,
    route_ids: [
      '04309424-da89-5756-b52d-ef56e5b99337', // Eldon | 4090
    ],
    routes: [],
  },
  {
    id: '94931f93-35e0-40fc-89bc-4a75377bd7d1',
    name: 'First Born Boulder',
    parent: ELDON,
    route_ids: [
      '95ed0b5a-5639-5a33-96e3-d30572eb53e6', // First Born Traverse
    ],
    routes: [],
  },
  {
    id: '2a5b9464-3c90-4f75-a54e-7960edcf8784',
    name: 'Raven Boulder',
    parent: ELDON,
    route_ids: [
      '3bca3bb4-6009-52f0-9211-e9b3b4be639a', // The Raven
      '3d9c234b-a6e8-50dd-a5f4-d9b4c03ecb6c', // The Raven Stand
      '0843fe21-1197-56d8-b5d0-4077bd6cbbd6', // Chairman Meow
      '20238c82-dbb3-500c-96ab-7ca8d8c8329a', // Apocalypse Meow
      '4b11a10e-a37f-5b6f-b08f-eebbfa3ee72d', // Raven Droppings
    ],
    routes: [],
  },
  {
    id: '2ed945ec-2728-46b1-9d75-7be5d568b128',
    name: '30 Degree Wall',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('5b348682-46a1-41e8-a252-336961d33db2', '30 Degree Wall Traverse', 'V3-', '125434897'),
    ],
  },
  {
    id: '6061c42b-73ff-4900-a431-bc366419c64e',
    name: 'Polar Express Boulder',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('2b488791-4345-40a9-b66c-05a656c755ba', 'Polar Express', 'V4-5', '202817236'),
      mpOnly('1cfffcb2-2f25-4025-aa3a-19924634be2c', 'Canary in a Coal Mine', 'V3', '202817317'),
    ],
  },
  {
    id: '8d55939c-f688-4c80-8d0e-12ba96de3f15',
    name: 'Alternator Boulder',
    parent: ELDON,
    route_ids: [
      '2208e027-732c-520a-83ff-34cc50860a1c', // The Alternator
      '8153d88a-bf1c-535b-b0f9-2f9483d60dee', // Diamond Dust
      '260be09e-2e21-56f8-947d-b881a69f674d', // Carburetor
    ],
    routes: [],
  },
  {
    id: 'c6016334-d63e-400d-a42e-86563353210b',
    name: 'Warm-up Boulder',
    parent: ELDON,
    route_ids: [
      '83bd7772-3409-5157-becf-c2a42213b88e', // Warmup Wall
      '7630d11d-889e-5226-beb9-eb7a429e9474', // Warm Up Left
    ],
    routes: [],
  },
  {
    id: 'a7de215e-2175-45f7-ad2c-d3f8d1399596',
    name: 'Original Warmup Wall',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('89d2136d-f4ef-4d1c-a667-88c7d4be9272', 'Original Warmup Wall Traverse', 'V0', '122514793'),
    ],
  },
  {
    id: 'ac14f621-f928-4f78-a107-09e4d6d43b4f',
    name: '3 Pillars Boulder',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('0075dff4-b9dd-421f-a6fa-c53de1342edc', '3 Pillars of the Present', 'V3+', '201822608'),
    ],
  },
  {
    id: '0f894fe8-2f87-4d94-9731-38e8cc7782cb',
    name: 'Pocket Hercules Boulder',
    parent: ELDON,
    route_ids: [
      '1c04bbc7-b334-5b98-8243-644fc596d5b8', // Pocket Hercules
      'f47e6daf-5c9d-5532-b6be-2afe61f73fd6', // The Cutting Edge AKA Pocket Hercules Left
      '4c1a6758-194e-58e0-a68b-4ac8dea694bd', // Nutrigrain (a.k.a. Please Hammer Don't Hurt Em')
    ],
    routes: [
      mpOnly('9b52b0f9-ab0f-471a-8c84-145b3b86caad', 'Pocket Hercules Right', 'V5', '122157454'),
    ],
  },
  {
    id: 'ff5d182c-7f3f-4b82-bf18-348d511d96f1',
    name: 'Wall above Pocket Hercules',
    parent: ELDON,
    route_ids: [
      '4e4ed22a-ea1e-5482-88fd-84ae81f590e8', // R-Naught
    ],
    routes: [
      mpOnly('c169039b-6859-47db-b12b-303a0d476631', 'Turkey Dinner', 'V4', '122250614'),
    ],
  },
  {
    id: '1692114a-edea-486f-bc00-df5ae0c384c1',
    name: 'All Along the Watertower Boulder',
    parent: ELDON,
    route_ids: [
      '7f78f4e5-d831-5919-a666-08ab609bd9ec', // All Along the Watertower
    ],
    routes: [],
  },
  {
    id: 'e6fa0698-44f2-443c-937c-1ab916fe0df7',
    name: 'Grip It and Rip It Boulder',
    parent: ELDON,
    route_ids: [
      '2859cb38-29df-5077-931b-f13ee91339b6', // Grip It and Rip It
    ],
    routes: [],
  },
  {
    id: '4d63a263-a897-4efc-8aa3-8d75b0c9f732',
    name: 'Bow Hunter Boulder',
    parent: ELDON,
    route_ids: [
      '0c7735e4-396f-5937-bcff-91ab1529ba73', // The Bow Hunter
    ],
    routes: [],
  },
  {
    id: 'abfe8271-21b2-4b85-9826-00b3b4300b5f',
    name: 'Refrigerator Cave',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('b4b45558-8843-4df3-becc-3647ba3b0357', 'The Refrigerator', 'V3', '123187530'),
      mpOnly('aaf1570d-69a0-44dd-b5e2-e885d689ff20', 'One and Done', 'V2', '125401720'),
      mpOnly('fba7cf0e-81c1-45d0-9802-5eb81476ba7e', 'El Taco de B', 'V8', '123471715'),
    ],
  },
  {
    id: '98d04448-cd6f-4af2-9c5a-4a9906b5ea1d',
    name: 'Sandy Scoops Boulder',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('f43a9a89-951d-46d0-b518-0dab297ad399', 'Ankle Biter', 'V7', '126045710'),
      mpOnly('457ad0e7-e031-4cda-827c-90546cbdfa49', 'trypophobia', 'V3', '204026501'),
    ],
  },
  {
    id: '160266d0-256d-4b4f-80b9-312ac220cccd',
    name: 'Pinch Point Boulder',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('bef21cde-8c4a-4632-80e2-f5a38470ffd1', 'Pinch Point', 'V3-', '125365520'),
    ],
  },
  {
    id: '017ec431-7e5a-4409-b769-4c298b2ac683',
    name: 'Little Big Boulder',
    parent: ELDON,
    route_ids: [

    ],
    routes: [
      mpOnly('007695c0-b0ce-45f7-9b52-186073c3703a', 'Big Little', 'V4', '201830125'),
    ],
  },
]
