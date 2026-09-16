#!/usr/bin/env node
/**
 * Acceptance check for `.claude/docs/crag-facts.json` — Phase 2 of
 * `docs/handoffs/climbing-research-brief-v1.md`.
 *
 * **This exists because the brief's acceptance criteria are machine-checkable and a
 * criterion nobody runs is not a criterion.** The file is hand-written research data, it
 * will be edited by hand again, and the two rules that matter most about it fail silently:
 *
 *   - **A missing field and a null field are the same to a reader and not to a program.**
 *     Every crag carries the full field set so that `null` is a visible answer rather than
 *     an absent key. Dropping a key while editing is invisible in review.
 *   - **`seepage_prone: false` is the exact defect this repo keeps shipping**
 *     (`.claude/rules/defect-patterns.md` §1 — a missing value rendered as a plausible one).
 *     §4.16 established the tufa rule is *sufficient, not necessary*: tufa present means
 *     water runs there, tufa absent means **nothing at all**. So "we found no seepage
 *     information" and "this crag does not seep" must never be the same value, and the only
 *     way to keep that true through future edits is to refuse `false` outright.
 *
 * CI runs this automatically: `.github/workflows/ci.yml` enumerates every root-level
 * `check:*` script from `package.json` rather than listing them, so this was covered the
 * moment it was named.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, '.claude', 'docs', 'crag-facts.json')

/** The brief's own floor: the ~65 crags the research already covered. */
const MIN_CRAGS = 65

/** From the legend in the file's own _README, which is the authority. */
const CONFIDENCE = new Set(['M', 'S', 'C', 'I', 'X'])

/** Identity fields. Plain values, because a crag's name is not a sourced claim. */
const IDENTITY = ['name', 'aka', 'region', 'country']

/**
 * Fact fields. Each is either `null` or `{ value, source, confidence }`.
 * `rock` and `closure` are their own shapes and are checked separately.
 */
const FACTS = [
  'seepage_prone',
  'seepage_mechanism',
  'water_features',
  'shelter',
  'aspect',
  'approach_hazard',
  'season_gate',
  'access_rules',
  'disciplines',
  'dries_fast_relative_to',
  'unmodelled_input',
]

/**
 * Fields where `false` is forbidden outright rather than merely discouraged.
 *
 * Both are absence-of-evidence fields. A `false` here would be read by any future
 * consumer as "checked, and it does not", which is a claim no source in the research
 * supports for any crag.
 */
const NEVER_FALSE = ['seepage_prone', 'water_features']

const errors = []
const warnings = []

function fail(where, message) {
  errors.push(`${where}: ${message}`)
}

let raw
try {
  raw = readFileSync(FILE, 'utf8')
} catch (err) {
  console.error(`FAIL  cannot read ${FILE}: ${err.message}`)
  process.exit(1)
}

let doc
try {
  doc = JSON.parse(raw)
} catch (err) {
  console.error(`FAIL  ${FILE} is not valid JSON: ${err.message}`)
  process.exit(1)
}

if (!doc._README) fail('file', 'the _README block is missing — it carries the null rule and the confidence legend')
if (!Array.isArray(doc.crags)) {
  console.error('FAIL  `crags` is not an array')
  process.exit(1)
}

if (doc.crags.length < MIN_CRAGS) {
  fail('file', `${doc.crags.length} crags, and the brief asks for at least ${MIN_CRAGS}`)
}

const seen = new Map()

for (const [i, crag] of doc.crags.entries()) {
  const where = `crags[${i}] ${crag?.name ?? '(unnamed)'}`

  if (typeof crag !== 'object' || crag === null) {
    fail(where, 'not an object')
    continue
  }

  for (const key of IDENTITY) {
    if (!(key in crag)) fail(where, `missing identity field \`${key}\``)
  }

  if (typeof crag.name !== 'string' || crag.name.trim() === '') {
    fail(where, '`name` must be a non-empty string')
  } else if (seen.has(crag.name)) {
    fail(where, `duplicate name — already used at crags[${seen.get(crag.name)}]`)
  } else {
    seen.set(crag.name, i)
  }

  // `rock` is always an object: every crag in the research has at least a family.
  if (typeof crag.rock !== 'object' || crag.rock === null) {
    fail(where, '`rock` must be an object')
  } else {
    for (const key of ['family', 'formation', 'note', 'source', 'confidence']) {
      if (!(key in crag.rock)) fail(where, `rock is missing \`${key}\``)
    }
    if (!crag.rock.source) fail(where, 'rock.source is empty — a fact without a source is not a fact')
    if (!CONFIDENCE.has(crag.rock.confidence)) {
      fail(where, `rock.confidence "${crag.rock.confidence}" is not one of ${[...CONFIDENCE].join(', ')}`)
    }
  }

  // `closure` is always present with all three keys, so "no closure recorded" is
  // visible rather than inferred from an absent object.
  if (typeof crag.closure !== 'object' || crag.closure === null) {
    fail(where, '`closure` must be an object, even when everything in it is null')
  } else {
    for (const key of ['months', 'reason', 'source']) {
      if (!(key in crag.closure)) fail(where, `closure is missing \`${key}\``)
    }
    if (crag.closure.months !== null && !crag.closure.source) {
      warnings.push(`${where}: closure.months is set but closure.source is null`)
    }
  }

  for (const key of FACTS) {
    if (!(key in crag)) {
      fail(where, `missing \`${key}\` — write null rather than dropping the key, or a reader cannot tell "unknown" from "not considered"`)
      continue
    }
    const v = crag[key]
    if (v === null) continue

    if (v === false) {
      fail(where, `\`${key}\` is false. Use null: see defect-patterns.md §1 and the tufa rule in §4.16`)
      continue
    }

    if (typeof v !== 'object' || Array.isArray(v)) {
      fail(where, `\`${key}\` must be null or { value, source, confidence } — got ${Array.isArray(v) ? 'an array' : typeof v}`)
      continue
    }

    if (!('value' in v)) fail(where, `\`${key}\` has no \`value\``)
    if (!v.source) fail(where, `\`${key}\` has no \`source\` — a fact without a source is not a fact`)
    if (!CONFIDENCE.has(v.confidence)) {
      fail(where, `\`${key}\`.confidence "${v.confidence}" is not one of ${[...CONFIDENCE].join(', ')}`)
    }
    if (NEVER_FALSE.includes(key) && v.value === false) {
      fail(where, `\`${key}\`.value is false. Absence of evidence is null, not a negative claim`)
    }
  }

  if (!Array.isArray(crag.sources) || crag.sources.length === 0) {
    fail(where, '`sources` must be a non-empty array')
  }
}

const total = doc.crags.length
const withSeepage = doc.crags.filter((c) => c.seepage_prone !== null).length
const withTufa = doc.crags.filter((c) => c.water_features !== null).length

console.log(`crag-facts.json: ${total} crags`)
console.log(`  seepage_prone known for ${withSeepage}, null (unknown) for ${total - withSeepage}`)
console.log(`  water_features known for ${withTufa}, null (unknown) for ${total - withTufa}`)

for (const w of warnings) console.log(`WARN  ${w}`)

if (errors.length > 0) {
  console.error(`\nFAILED — ${errors.length} problem(s):`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}

console.log(`\nALL PASSED — ${total} crags, every non-null fact carries a source and a confidence marker.`)
