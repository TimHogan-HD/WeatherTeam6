// Crag A / Wall A reference model and error hunt. Not app code: copy to apps/api/src/scripts/ to run.
// See README.md beside this file.
import { writeFileSync } from 'node:fs'
import { conditionsScore } from '../lib/scoring/conditionsScore.js'
import {
  evaluateHourlyConditions,
  dryingWindowHours,
  type WeatherHour,
  type HourlyConditions,
} from '../lib/scoring/hourlyConditions.js'
import type { RockType } from '@weatherteam6/types'

const OUT = process.argv[2] ?? 'hunt.json'
export const FIX = { dry: false, snow: false, shelterReal: false, window: 0 }
const fToC = (f: number) => ((f - 32) * 5) / 9
const cToF = (c: number) => (c * 9) / 5 + 32
const es = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
const LAT = 36.1, LON = -115.4, OFFSET_H = -7

type Wx = { hi: number; lo: number; dew: number; wind: number; gust?: number; cloud: number }
type Rain = { stopH: number; inches: number; durH: number } // stopH: hours relative to target-day 00:00 local
type Case = {
  id: string
  name: string
  rock: RockType
  lat?: number
  real?: { hours: WeatherHour[]; offsetH: number }
  lon?: number
  angle?: number // stored convention: 0 vertical, 90 flat, negative overhanging
  rainScale?: number
  aspect: number // wall faces (deg); 180 south = sun, 0 north = shade, 90 east
  month: number
  wx: Wx
  historyWx?: Wx // days before the target day, if different
  rain?: Rain[]
  dryHistory: boolean
  evalHours: [number, number]
  expect: ('go' | 'marginal' | 'no')[]
  confidence: 'High' | 'Medium' | 'Low'
  source: string
  seenInDesign: boolean
  seeps?: { days: number }
  forecastRainNextMm?: number
  rainDewGapC?: number
  priorDryHours?: number
}

const AF = 'Access Fund sandstone guidance'
const CL = 'Climbit default preferences'
const CR = 'CragReport grease factor'
const PH = 'Physics'
const CV = 'Climber convention'

const FALL: Wx = { hi: 62, lo: 44, dew: 36, wind: 6, cloud: 10 }
const SUNNY: Wx = { hi: 66, lo: 48, dew: 40, wind: 9, cloud: 5 }
const GREY: Wx = { hi: 54, lo: 48, dew: 50, wind: 2, cloud: 95 }

const CASES: Case[] = [
  { id: 'C1', name: 'Perfect fall day, granite', rock: 'granite', aspect: 180, month: 10, wx: FALL, dryHistory: true, evalHours: [8, 18], expect: ['go'], confidence: 'High', source: `${CL}; ${CV}`, seenInDesign: true },
  { id: 'C2', name: 'Crisp winter sun, granite', rock: 'granite', aspect: 180, month: 1, wx: { hi: 42, lo: 26, dew: 18, wind: 5, cloud: 0 }, dryHistory: true, evalHours: [8, 18], expect: ['go'], confidence: 'High', source: `${CL} (ideal 32-55 °F)`, seenInDesign: false },
  { id: 'C3', name: 'Winter shade, 30 °F, granite', rock: 'granite', aspect: 0, month: 1, wx: { hi: 30, lo: 14, dew: 8, wind: 5, cloud: 20 }, dryHistory: true, evalHours: [8, 18], expect: ['go', 'marginal'], confidence: 'Low', source: `${CL} (acceptable down to 20 °F)`, seenInDesign: true },
  { id: 'C4', name: 'Deep cold, 18 °F shade', rock: 'granite', aspect: 0, month: 1, wx: { hi: 18, lo: 2, dew: -6, wind: 5, cloud: 20 }, dryHistory: true, evalHours: [8, 18], expect: ['no', 'marginal'], confidence: 'Medium', source: `${CL} (below acceptable 20 °F)`, seenInDesign: false },
  { id: 'C5', name: 'Desert heat, sunny wall, 104 °F', rock: 'sandstone_eolian', aspect: 180, month: 7, wx: { hi: 104, lo: 78, dew: 38, wind: 6, cloud: 0 }, dryHistory: true, evalHours: [8, 18], expect: ['no'], confidence: 'High', source: `${CL} (acceptable to 78 °F); issue #21`, seenInDesign: true },
  { id: 'C6', name: 'Desert heat, shaded wall, 104 °F', rock: 'sandstone_eolian', aspect: 0, month: 7, wx: { hi: 104, lo: 78, dew: 38, wind: 6, cloud: 0 }, dryHistory: true, evalHours: [8, 18], expect: ['no', 'marginal'], confidence: 'Medium', source: CL, seenInDesign: true },
  { id: 'C7', name: 'Hot 95 °F, sunny wall', rock: 'limestone_dense', aspect: 180, month: 7, wx: { hi: 95, lo: 70, dew: 45, wind: 6, cloud: 10 }, dryHistory: true, evalHours: [8, 18], expect: ['no', 'marginal'], confidence: 'Medium', source: CL, seenInDesign: false },
  { id: 'C8', name: 'Warm 82 °F, shaded wall, dry air', rock: 'granite', aspect: 0, month: 6, wx: { hi: 82, lo: 60, dew: 45, wind: 6, cloud: 10 }, dryHistory: true, evalHours: [8, 18], expect: ['go', 'marginal'], confidence: 'Low', source: CL, seenInDesign: false },
  { id: 'C9', name: 'Muggy summer, dew point 70 °F', rock: 'limestone_dense', aspect: 180, month: 7, wx: { hi: 88, lo: 72, dew: 70, wind: 4, cloud: 40 }, dryHistory: true, evalHours: [8, 18], expect: ['no'], confidence: 'High', source: `${CR}; ${CL} (humidity)`, seenInDesign: true },
  { id: 'C10', name: 'Mild but humid, dew point 63 °F', rock: 'granite', aspect: 180, month: 9, wx: { hi: 70, lo: 62, dew: 63, wind: 4, cloud: 70 }, dryHistory: true, evalHours: [8, 18], expect: ['marginal', 'no'], confidence: 'Medium', source: `${CR}; ${CL}`, seenInDesign: false },
  { id: 'C11', name: 'Warm humid air after a cold snap, morning', rock: 'granite', aspect: 0, month: 3, historyWx: { hi: 40, lo: 25, dew: 20, wind: 5, cloud: 10 }, wx: { hi: 62, lo: 50, dew: 55, wind: 4, cloud: 80 }, dryHistory: true, evalHours: [7, 9], expect: ['no'], confidence: 'High', source: `${PH}; issue #140`, seenInDesign: false },
  { id: 'C12', name: 'Soft sandstone, 12 h after 1" rain, sunny', rock: 'sandstone_soft', aspect: 180, month: 10, wx: SUNNY, rain: [{ stopH: 0, inches: 1, durH: 8 }], dryHistory: true, evalHours: [12, 12], expect: ['no'], confidence: 'High', source: AF, seenInDesign: false },
  { id: 'C13', name: 'Soft sandstone, 36 h after 0.1" shower, sunny', rock: 'sandstone_soft', aspect: 180, month: 10, wx: SUNNY, rain: [{ stopH: -24, inches: 0.1, durH: 2 }], dryHistory: true, evalHours: [12, 12], expect: ['go', 'marginal'], confidence: 'High', source: `${AF} (24-48 h after light rain in sun)`, seenInDesign: true },
  { id: 'C14', name: 'Soft sandstone, 60 h after 1" rain, grey and humid', rock: 'sandstone_soft', aspect: 180, month: 10, wx: GREY, rain: [{ stopH: -48, inches: 1, durH: 8 }], dryHistory: true, evalHours: [12, 12], expect: ['no'], confidence: 'High', source: `${AF} (several days to a week when humid and cool)`, seenInDesign: false },
  { id: 'C15', name: 'Soft sandstone, 7 days after 1" rain, sunny', rock: 'sandstone_soft', aspect: 180, month: 10, wx: SUNNY, rain: [{ stopH: -156, inches: 1, durH: 8 }], dryHistory: true, evalHours: [12, 12], expect: ['go'], confidence: 'High', source: AF, seenInDesign: false },
  { id: 'C16', name: 'Granite, 4 h after 0.2" shower, sunny', rock: 'granite', aspect: 180, month: 10, wx: SUNNY, rain: [{ stopH: 8, inches: 0.2, durH: 2 }], dryHistory: true, evalHours: [12, 12], expect: ['go', 'marginal'], confidence: 'Medium', source: CV, seenInDesign: false },
  { id: 'C17', name: 'Granite, 3 h after 0.5" rain, grey and still', rock: 'granite', aspect: 180, month: 10, wx: GREY, rain: [{ stopH: 9, inches: 0.5, durH: 4 }], dryHistory: true, evalHours: [12, 12], expect: ['no', 'marginal'], confidence: 'Medium', source: `${CV}; ${PH}`, seenInDesign: false },
  { id: 'C18', name: 'Porous limestone, 48 h after 1", sunny', rock: 'limestone_porous', aspect: 180, month: 10, wx: SUNNY, rain: [{ stopH: -36, inches: 1, durH: 8 }], dryHistory: true, evalHours: [12, 12], expect: ['go', 'marginal'], confidence: 'Low', source: CV, seenInDesign: false },
  { id: 'C19', name: 'Porous limestone, 48 h after 1", grey', rock: 'limestone_porous', aspect: 180, month: 10, wx: GREY, rain: [{ stopH: -36, inches: 1, durH: 8 }], dryHistory: true, evalHours: [12, 12], expect: ['no'], confidence: 'Medium', source: CV, seenInDesign: false },
  { id: 'C20', name: 'Raining during the day', rock: 'granite', aspect: 180, month: 10, wx: FALL, rain: [{ stopH: 19, inches: 0.8, durH: 12 }], dryHistory: true, evalHours: [9, 18], expect: ['no'], confidence: 'High', source: PH, seenInDesign: false },
  { id: 'C21', name: 'Perfect temps, 30 mph wind, 50 mph gusts', rock: 'granite', aspect: 180, month: 10, wx: { ...FALL, wind: 30, gust: 50 }, dryHistory: true, evalHours: [8, 18], expect: ['go', 'marginal'], confidence: 'Low', source: 'Friction unaffected; wind is a safety flag, not grip', seenInDesign: true },
  { id: 'C22', name: 'Dry today, 0.5" forecast tomorrow', rock: 'granite', aspect: 180, month: 10, wx: FALL, dryHistory: true, evalHours: [8, 18], expect: ['go'], confidence: 'Medium', source: 'Rain that has not fallen does not wet today', seenInDesign: false, forecastRainNextMm: 12.7 },
  { id: 'C23', name: 'Seeping crag, 4 days after 1.2" rain', rock: 'limestone_porous', aspect: 180, month: 10, wx: SUNNY, rain: [{ stopH: -84, inches: 1.2, durH: 10 }], dryHistory: true, evalHours: [12, 12], expect: ['no', 'marginal'], confidence: 'Medium', source: `${CV} (known seeps run for days)`, seenInDesign: true, seeps: { days: 5 } },
  { id: 'C24', name: 'Dense limestone, 24 h after 1", sunny', rock: 'limestone_dense', aspect: 180, month: 10, wx: SUNNY, rain: [{ stopH: -12, inches: 1, durH: 8 }], dryHistory: true, evalHours: [12, 12], expect: ['go', 'marginal'], confidence: 'Low', source: CV, seenInDesign: false },
  { id: 'C25', name: 'Hot and humid in the shade, dew point 66 °F', rock: 'granite', aspect: 0, month: 7, wx: { hi: 84, lo: 70, dew: 66, wind: 4, cloud: 30 }, dryHistory: true, evalHours: [8, 18], expect: ['no', 'marginal'], confidence: 'Medium', source: CR, seenInDesign: false },
  { id: 'C26', name: 'Cool overcast day, dry week', rock: 'granite', aspect: 180, month: 11, wx: { hi: 50, lo: 42, dew: 38, wind: 5, cloud: 100 }, dryHistory: true, evalHours: [8, 18], expect: ['go', 'marginal'], confidence: 'Low', source: CL, seenInDesign: false },
]

const HISTORY_DAYS = 8

function tempAt(w: Wx, lh: number) {
  const hiC = fToC(w.hi), loC = fToC(Math.min(w.lo, w.hi))
  return (hiC + loC) / 2 + ((hiC - loC) / 2) * Math.cos((2 * Math.PI * (lh - 15)) / 24)
}

type Built = { hours: WeatherHour[]; localHour: number[]; dayIdx: number[]; stormMm: number[]; hoursSinceStorm: number[] }

function buildSeries(c: Case): Built {
  if (c.real) return builtFromReal(FIX.shelterReal && (c.rainScale ?? 1) !== 1 ? { ...c.real, hours: c.real.hours.map((h) => ({ ...h, precip_mm: h.precip_mm === null ? null : h.precip_mm * (c.rainScale ?? 1) })) } : c.real)
  const hours: WeatherHour[] = [], localHour: number[] = [], dayIdx: number[] = []
  const start = Date.UTC(2026, c.month - 1, 15) - HISTORY_DAYS * 86400e3 - Math.round((c.lon ?? LON) / 15) * 3600e3
  const total = (HISTORY_DAYS + 1) * 24
  const rainMm = new Array<number>(total).fill(0)
  for (const r of c.rain ?? []) {
    const stopIdx = HISTORY_DAYS * 24 + r.stopH
    for (let k = 0; k < r.durH; k++) {
      const i = stopIdx - 1 - k
      if (i >= 0 && i < total) rainMm[i] += ((r.inches * 25.4) / r.durH) * (c.rainScale ?? 1)
    }
  }
  for (let i = 0; i < total; i++) {
    const lh = i % 24
    const day = Math.floor(i / 24)
    const w = day < HISTORY_DAYS && c.historyWx ? c.historyWx : c.wx
    const Ta = tempAt(w, lh)
    const raining = rainMm[i] > 0
    const cloud = raining ? 100 : w.cloud
    const sunUp = lh > 6 && lh < 19 ? Math.sin((Math.PI * (lh - 6)) / 13) : 0
    const ghi = 900 * (1 - (0.75 * cloud) / 100) * sunUp
    hours.push({
      valid_at: new Date(start + i * 3600e3).toISOString(),
      air_temp_c: Ta,
      dewpoint_c: raining ? Ta - (c.rainDewGapC ?? 0) : Math.min(fToC(w.dew), Ta),
      wind_kmh: w.wind * 1.609,
      cloud_pct: cloud,
      shortwave_wm2: ghi,
      precip_mm: rainMm[i],
    })
    localHour.push(lh)
    dayIdx.push(day)
  }
  // Storm totals: rain hours separated by gaps under 6 h belong to one storm.
  const stormMm: number[] = [], hoursSinceStorm: number[] = []
  let storm = 0, lastWet = -1e9
  for (let i = 0; i < total; i++) {
    if (rainMm[i] >= 0.1) {
      storm = i - lastWet < 24 ? storm + rainMm[i] : rainMm[i]
      lastWet = i
    }
    stormMm.push(storm)
    hoursSinceStorm.push(i - lastWet)
  }
  return { hours, localHour, dayIdx, stormMm, hoursSinceStorm }
}

// ---- Layers ------------------------------------------------------------------
type Knobs = {
  metabolicW: number
  windowScale: number
  fullSoakIn: number
  heatStartF: number
  dewStartF: number
  greaseStartF: number
  idealHiF: number
  idealLoF: number
  accHiF: number
  accLoF: number
  fricExp: number
  sunBlend: number
  coldStartF: number
}
const DEFAULT_KNOBS: Knobs = { metabolicW: 400, windowScale: 1, fullSoakIn: 0.4, heatStartF: 72, dewStartF: 54, greaseStartF: 50, idealHiF: 90, idealLoF: 40, accHiF: 115, accLoF: 25, fricExp: 0.45, sunBlend: 1, coldStartF: -999 }

const ramp = (eff: number, need: number) => (need <= 0 || eff >= need ? 1 : Math.pow(Math.max(0, eff) / need, 2))

function drynessB(c: Case, h: HourlyConditions, k: Knobs) {
  const eff = h.diagnostics.effective_dry_hours
  if (eff === null) return null
  return ramp(eff, dryingWindowHours(c.rock, 0).maxHours * k.windowScale)
}
function drynessC(c: Case, h: HourlyConditions, k: Knobs, b: Built, i: number) {
  const eff = h.diagnostics.effective_dry_hours
  if (eff === null) return null
  const stormIn = b.stormMm[i] / 25.4
  const load = stormIn > 0 ? Math.min(1, Math.sqrt(stormIn / k.fullSoakIn)) : 1
  let d = ramp(eff, dryingWindowHours(c.rock, Math.max(0, c.angle ?? 0)).maxHours * k.windowScale * load)
  if (c.seeps && stormIn >= 0.75 && b.hoursSinceStorm[i] < c.seeps.days * 24) d = Math.min(d, 0.25)
  return d
}
const condFrom = (margin: number) => (margin <= 0 ? 0 : margin >= 2 ? 1 : margin / 2)

function frictionS(_c: Case, h: HourlyConditions) {
  return h.diagnostics.friction_factor
}
function frictionH(_c: Case, h: HourlyConditions, k: Knobs, w: WeatherHour) {
  const tm = h.diagnostics.t_mass_c
  if (tm === null || w.air_temp_c === null || w.dewpoint_c === null) return null
  const cond = condFrom(tm - w.dewpoint_c)
  const heat = Math.exp(-Math.max(0, w.air_temp_c - fToC(k.heatStartF)) / 12)
  const hum = Math.exp(-Math.max(0, w.dewpoint_c - fToC(k.dewStartF)) / 10)
  const cold = Math.exp(-Math.max(0, fToC(k.coldStartF) - w.air_temp_c) / 12)
  return cond * heat * hum * cold
}
function tempFit(TsF: number, k: Knobs) {
  const lo = k.idealLoF, hi = k.idealHiF, alo = k.accLoF, ahi = k.accHiF
  if (TsF >= lo && TsF <= hi) return 1
  if (TsF < lo) { const d = lo - TsF, span = lo - alo; return d <= span ? 1 - (0.65 * d) / span : 0.35 * Math.exp(-(d - span) / 10) }
  const d = TsF - hi, span = ahi - hi
  return d <= span ? 1 - (0.65 * d) / span : 0.35 * Math.exp(-(d - span) / 10)
}
function frictionG(_c: Case, h: HourlyConditions, k: Knobs, w: WeatherHour) {
  const tm = h.diagnostics.t_mass_c, ts = h.t_surface_c
  if (tm === null || ts === null || w.dewpoint_c === null) return null
  const cond = condFrom(Math.min(ts, tm) - w.dewpoint_c)
  const grease = Math.exp(-Math.max(0, cToF(w.dewpoint_c) - k.greaseStartF) / 14)
  const feel = w.air_temp_c === null ? ts : w.air_temp_c + k.sunBlend * (ts - w.air_temp_c)
  return cond * grease * tempFit(cToF(feel), k)
}

function runV1(c: Case, b: Built) {
  const evalIdx = HISTORY_DAYS * 24 + (c.evalHours[0] === c.evalHours[1] ? c.evalHours[0] : 14)
  let lastRainIdx = -1
  let lastRainMm = 0
  for (let i = 0; i <= evalIdx; i++) if ((b.hours[i].precip_mm ?? 0) > 0) { lastRainIdx = i; lastRainMm = b.stormMm[i] }
  const hoursSinceRain = lastRainIdx < 0 ? 720 : evalIdx - lastRainIdx
  const day = b.hours.slice(HISTORY_DAYS * 24)
  const hiC = Math.max(...day.map((h) => h.air_temp_c ?? -99))
  const w14 = b.hours[HISTORY_DAYS * 24 + 14]
  const rh = (100 * es(w14.dewpoint_c ?? 0)) / es(w14.air_temp_c ?? 0)
  // rain still to fall today counts as upcoming rain for v1
  const upcoming = b.hours.slice(evalIdx + 1).reduce((s, h) => s + (h.precip_mm ?? 0), 0) + (c.forecastRainNextMm ?? 0)
  const windKmh = (c.wx.gust ?? c.wx.wind * 1.4) * 1.609
  const out = conditionsScore({
    rockType: c.rock, aspectDegrees: c.aspect, cliffAngle: 0, hoursSinceRain, lastRainMm,
    forecastRain72hMm: upcoming, forecastRain72hP10: upcoming, forecastRain72hP90: upcoming,
    currentWindKmh: c.wx.wind * 1.609, maxWindKmh24h: windKmh, currentTempC: tempAt(c.wx, 14),
    forecastHighC: hiC, currentHumidityPct: rh, forecastDateDaysOut: 0,
  })
  return out.score
}

// ======================= Exploration: sun ratios, wall aspect/angle, crag vs wall =======================
const verdict = (s: number | null) => (s === null ? 'none' : s >= 60 ? 'go' : s >= 40 ? 'marginal' : 'no')
const Wt = { High: 3, Medium: 2, Low: 1 } as const
const RK = { no: 0, marginal: 1, go: 2 } as const
const BANDS = { go: [60, 100], marginal: [40, 59], no: [0, 39] } as const
function gradeScores(cases: Case[], scores: Record<string, number | null>) {
  let hits = 0, wh = 0, wn = 0, dist = 0; const falseGo: string[] = [], misses: string[] = []
  for (const c of cases) {
    const s = scores[c.id], vv = verdict(s)
    wn += Wt[c.confidence]
    if ((c.expect as string[]).includes(vv)) { hits++; wh += Wt[c.confidence] } else {
      misses.push(c.id)
      if (vv !== 'none' && RK[vv as keyof typeof RK] > Math.max(...c.expect.map((e) => RK[e]))) falseGo.push(c.id)
    }
    if (s !== null) {
      const lo = Math.min(...c.expect.map((e) => BANDS[e][0])), hi = Math.max(...c.expect.map((e) => BANDS[e][1]))
      dist += s < lo ? lo - s : s > hi ? s - hi : 0
    }
  }
  return { hits, n: cases.length, w: Math.round((100 * wh) / wn), dist, falseGo, misses }
}

// ---- Case sets ----
const CRAG_OVR: Record<string, Partial<Case>> = {
  C3: { name: 'Winter, 30 °F, partly sunny' }, C5: { name: 'Desert heat, 104 °F' },
  C6: { name: 'Winter sun, 35 °F, calm', rock: 'granite', month: 1, wx: { hi: 35, lo: 20, dew: 12, wind: 3, cloud: 0 }, expect: ['go'], confidence: 'Medium', source: `${CL} (ideal 32-55 °F)`, seenInDesign: false },
  C7: { name: 'Hot 95 °F, clear' }, C8: { name: 'Warm 82 °F, dry air', expect: ['marginal', 'no'], source: `${CL} (acceptable to 78 °F)` },
  C25: { name: 'Hot and humid, dew point 66 °F' },
}
const CRAG: Case[] = [
  ...CASES.map((c) => ({ ...c, ...(CRAG_OVR[c.id] ?? {}) })),
  { id: 'C27', name: 'Sunny 75 °F, dry air', rock: 'granite', aspect: 180, month: 10, wx: { hi: 75, lo: 55, dew: 40, wind: 6, cloud: 0 }, dryHistory: true, evalHours: [8, 18], expect: ['go', 'marginal'], confidence: 'Medium', source: `${CL} (acceptable to 78 °F)`, seenInDesign: false },
  { id: 'C28', name: 'Clear 88 °F, dry air', rock: 'granite', aspect: 180, month: 10, wx: { hi: 88, lo: 64, dew: 40, wind: 6, cloud: 0 }, dryHistory: true, evalHours: [8, 18], expect: ['no', 'marginal'], confidence: 'Medium', source: `${CL} (acceptable to 78 °F)`, seenInDesign: false },
]
const MILD_GREY: Wx = { hi: 60, lo: 50, dew: 52, wind: 4, cloud: 90 }
const WALLS: Case[] = [
  ...CASES.map((c) => ({ ...c, angle: 0, ...(c.id === "C15" ? { expect: ["go", "marginal"] as Case["expect"], source: `${AF}; sunny wall at noon may feel warm` } : {}) })),
  { id: 'A1', name: 'Overhang 30°, light rain until 11 am', rock: 'limestone_dense', aspect: 180, angle: -30, month: 10, wx: MILD_GREY, rain: [{ stopH: 11, inches: 0.15, durH: 3 }], dryHistory: true, evalHours: [12, 14], expect: ['go', 'marginal'], confidence: 'Medium', source: `${CV} (steep rock stays dry in light rain)`, seenInDesign: false },
  { id: 'A2', name: 'Vertical wall, same light rain', rock: 'limestone_dense', aspect: 180, angle: 0, month: 10, wx: MILD_GREY, rain: [{ stopH: 11, inches: 0.15, durH: 3 }], dryHistory: true, evalHours: [12, 14], expect: ['no', 'marginal'], confidence: 'Medium', source: `${CV}; ${PH}`, seenInDesign: false },
  { id: 'A3', name: 'Overhang 30°, 2 h after 0.4" shower, sunny', rock: 'limestone_dense', aspect: 180, angle: -30, month: 10, wx: SUNNY, rain: [{ stopH: 10, inches: 0.4, durH: 3 }], dryHistory: true, evalHours: [12, 12], expect: ['go', 'marginal'], confidence: 'Medium', source: CV, seenInDesign: false },
  { id: 'A4', name: 'South slab, sunny 72 °F, midday', rock: 'granite', aspect: 180, angle: 30, month: 10, wx: { hi: 72, lo: 50, dew: 40, wind: 5, cloud: 0 }, dryHistory: true, evalHours: [12, 14], expect: ['marginal', 'no'], confidence: 'Low', source: `${CV} (slabs bake in midday sun)`, seenInDesign: false },
  { id: 'A5', name: 'North slab, same day, midday', rock: 'granite', aspect: 0, angle: 30, month: 10, wx: { hi: 72, lo: 50, dew: 40, wind: 5, cloud: 0 }, dryHistory: true, evalHours: [12, 14], expect: ['go', 'marginal'], confidence: 'Low', source: CV, seenInDesign: false },
  { id: 'A6', name: 'South slab, 6 h after 0.3" rain, sunny', rock: 'granite', aspect: 180, angle: 30, month: 10, wx: SUNNY, rain: [{ stopH: 6, inches: 0.3, durH: 3 }], dryHistory: true, evalHours: [12, 12], expect: ['go', 'marginal'], confidence: 'Medium', source: CV, seenInDesign: false },
  { id: 'A7', name: 'North overhang, winter 35 °F', rock: 'granite', aspect: 0, angle: -30, month: 1, wx: { hi: 35, lo: 20, dew: 12, wind: 3, cloud: 0 }, dryHistory: true, evalHours: [8, 18], expect: ['go', 'marginal'], confidence: 'Low', source: CL, seenInDesign: false },
]

// ---- Views: one evaluated series per (weather, sun treatment) ----
type ViewSpec = { kind: 'flat'; f: number } | { kind: 'wall'; aspect: number; angle: number }
const vCache = new Map<string, { built: Built; series: HourlyConditions[] }>()
function view(c: Case, spec: ViewSpec) {
  const key = JSON.stringify([FIX, c.real ? c.id : "", c.rainDewGapC, c.lat, c.lon, c.rock, c.month, c.wx, c.historyWx, c.rain, c.rainScale ?? 1, c.dryHistory, spec])
  const hit = vCache.get(key)
  if (hit) return hit
  const built = buildSeries(c)
  const base = { rockType: c.rock, cliffAngleDeg: 0, priorEffectiveHours: c.dryHistory ? 1e4 : 0 }
  let series: HourlyConditions[]
  if (spec.kind === 'flat') {
    const hours = built.hours.map((h) => ({ ...h, shortwave_wm2: h.shortwave_wm2 === null ? null : h.shortwave_wm2 * spec.f }))
    series = evaluateHourlyConditions(hours, spec.f === 0 ? { ...base, includeSun: false } : base)
  } else {
    series = evaluateHourlyConditions(built.hours, { ...base, cliffAngleDeg: spec.angle, wall: { lat: c.lat ?? LAT, lon: c.lon ?? LON, aspectDeg: spec.aspect, cliffAngleDeg: spec.angle } })
  }
  const v = { built, series }
  vCache.set(key, v)
  return v
}

type Grip = 'H' | 'G'
function comps(c: Case, g: Grip, spec: ViewSpec, i: number, k: Knobs) {
  const { built, series } = view(c, spec)
  const h = series[i], w = built.hours[i]
  return { dry: FIX.dry ? drynessD(c, series, k, built, i) : drynessC(c, h, k, built, i), fric: g === 'H' ? frictionH(c, h, k, w) : frictionG(c, h, k, w) }
}
const ASP = [0, 45, 90, 135, 180, 225, 270, 315]
type Sun = 'f100' | 'f75' | 'f50' | 'f25' | 'f0' | 'wMedian' | 'wMean' | 'wP25' | 'wP75'
const SUNS: Sun[] = ['f100', 'f75', 'f50', 'f25', 'f0', 'wMedian', 'wMean', 'wP25', 'wP75']
const SUN_NAME: Record<Sun, string> = { f100: 'Flat, full sun', f75: 'Flat, 75% sun', f50: 'Flat, 50% sun', f25: 'Flat, 25% sun', f0: 'No sun', wMedian: '8 walls, median', wMean: '8 walls, mean', wP25: '8 walls, 25th pct', wP75: '8 walls, 75th pct' }
function stat(xs: number[], s: Sun) {
  const a = [...xs].sort((p, q) => p - q), q = (p: number) => { const x = p * (a.length - 1), lo = Math.floor(x); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (x - lo) }
  return s === 'wMean' ? a.reduce((p, q2) => p + q2, 0) / a.length : s === 'wMedian' ? q(0.5) : s === 'wP25' ? q(0.25) : q(0.75)
}
function component(c: Case, g: Grip, sun: Sun, i: number, k: Knobs, which: 'dry' | 'fric'): number | null {
  if (sun.startsWith('f')) return comps(c, g, { kind: 'flat', f: +sun.slice(1) / 100 }, i, k)[which]
  const xs = ASP.map((a) => comps(c, g, { kind: 'wall', aspect: a, angle: 0 }, i, k)[which])
  if (xs.some((x) => x === null)) return null
  return stat(xs as number[], sun)
}
const combine = (dry: number | null, fric: number | null, k: Knobs) => dry === null || fric === null ? null : 100 * Math.pow(dry, 0.55) * Math.pow(Math.max(0, Math.min(1, fric)), k.fricExp)
function dayBest(c: Case, hourScore: (i: number) => number | null) {
  const { built } = view(c, { kind: 'flat', f: 1 })
  let best: number | null = null
  const W = c.evalHours[1] - c.evalHours[0] + 1 >= FIX.window ? Math.max(1, FIX.window) : 1
  const idx: number[] = []
  for (let i = HISTORY_DAYS * 24; i < built.hours.length; i++) {
    const lh = built.localHour[i]
    if (lh >= c.evalHours[0] && lh <= c.evalHours[1]) idx.push(i)
  }
  const hs = idx.map((i) => hourScore(i))
  // A day is worth its best run of W consecutive hours, each run valued at its worst hour.
  for (let a = 0; a + W <= hs.length; a++) {
    const run = hs.slice(a, a + W)
    if (run.some((x) => x === null)) continue
    const s = Math.min(...(run as number[]))
    if (best === null || s > best) best = s
  }
  return best === null ? null : Math.round(best)
}
type CragCfg = { id: string; grip: Grip; drySun: Sun; gripSun: Sun }
const cragScore = (c: Case, cfg: CragCfg, k: Knobs) => dayBest(c, (i) => combine(component(c, cfg.grip, cfg.drySun, i, k, 'dry'), component(c, cfg.grip, cfg.gripSun, i, k, 'fric'), k))

// ---- Wall configs: which wall variables the model uses ----
type WallMode = 'none' | 'aspect' | 'angle' | 'shelter'
const WALL_NAME: Record<WallMode, string> = { none: 'Crag model (8 walls, median) used for the wall', aspect: 'Aspect only (vertical assumed)', angle: 'Aspect + angle', shelter: 'Aspect + angle + overhang rain shelter' }
const shelterScale = (angle: number) => { const d = Math.max(0, -angle); return d < 5 ? 1 : Math.max(0.1, 1 - d / 30) }
type WallCfg = { id: string; grip: Grip; mode: WallMode }
function wallScore(c0: Case, cfg: WallCfg, k: Knobs) {
  const angle = c0.angle ?? 0
  if (cfg.mode === 'none') { const c = { ...c0, angle: 0 }; return cragScore(c, { id: '', grip: cfg.grip, drySun: 'wMedian', gripSun: 'wMedian' }, k) }
  const c: Case = cfg.mode === 'aspect' ? { ...c0, angle: 0 } : cfg.mode === 'angle' ? c0 : { ...c0, rainScale: shelterScale(angle) }
  const spec: ViewSpec = { kind: 'wall', aspect: c.aspect, angle: cfg.mode === 'aspect' ? 0 : angle }
  return dayBest(c, (i) => { const x = comps(c, cfg.grip, spec, i, k); return combine(x.dry, x.fric, k) })
}


function builtFromReal(r: { hours: WeatherHour[]; offsetH: number }): Built {
  const hours = r.hours, localHour: number[] = [], dayIdx: number[] = [], stormMm: number[] = [], hoursSinceStorm: number[] = []
  let storm = 0, lastWet = -1e9
  hours.forEach((h, i) => {
    const t = Date.parse(h.valid_at) + r.offsetH * 3600e3
    localHour.push(new Date(t).getUTCHours())
    dayIdx.push(Math.floor(t / 86400e3))
    const p = h.precip_mm ?? 0
    if (p >= 0.1) { storm = i - lastWet < 24 ? storm + p : p; lastWet = i }
    stormMm.push(storm); hoursSinceStorm.push(i - lastWet)
  })
  return { hours, localHour, dayIdx, stormMm, hoursSinceStorm }
}

// ================= The four options, fixed shared settings =================
const KH: Knobs = { ...DEFAULT_KNOBS, heatStartF: 60, dewStartF: 54, coldStartF: 30, fricExp: 1 }
const KG: Knobs = { ...DEFAULT_KNOBS, greaseStartF: 50, idealHiF: 65, accHiF: 90, sunBlend: 0.5, fricExp: 1 }
type OptId = 'CA' | 'CB' | 'WA' | 'WB'
const OPT_K: Record<OptId, Knobs> = { CA: KH, CB: KG, WA: KH, WB: KG }
function hourScoreOpt(o: OptId, c: Case, i: number, k: Knobs = OPT_K[o]): number | null {
  if (o === 'CA') return combine(component(c, 'H', 'wMedian', i, k, 'dry'), component(c, 'H', 'f0', i, k, 'fric'), k)
  if (o === 'CB') return combine(component(c, 'G', 'wMedian', i, k, 'dry'), component(c, 'G', 'wMedian', i, k, 'fric'), k)
  const angle = c.angle ?? 0
  const cc: Case = { ...c, rainScale: shelterScale(angle) }
  const x = comps(cc, o === 'WA' ? 'H' : 'G', { kind: 'wall', aspect: c.aspect, angle }, i, k)
  return combine(x.dry, x.fric, k)
}
const optDay = (o: OptId, c: Case, k: Knobs = OPT_K[o]) => dayBest(c, (i) => hourScoreOpt(o, c, i, k))
const CRAG_OPTS: OptId[] = ['CA', 'CB'], WALL_OPTS: OptId[] = ['WA', 'WB']

// ================= Test 1: fresh days, never used for tuning =================
const L = {
  rrg: { lat: 37.78, lon: -83.68 }, smith: { lat: 44.37, lon: -121.14 }, joshua: { lat: 34.01, lon: -116.17 }, rumney: { lat: 43.8, lon: -71.84 },
  squamish: { lat: 49.68, lon: -123.15 }, font: { lat: 48.44, lon: 2.64 }, kaly: { lat: 36.98, lon: 26.98 }, yos: { lat: 37.73, lon: -119.6 }, nrg: { lat: 38.07, lon: -81.08 }, rr: { lat: 36.13, lon: -115.43 },
}
const fc = (id: string, name: string, loc: { lat: number; lon: number }, rock: RockType, month: number, wx: Wx, expect: Case['expect'], confidence: Case['confidence'], source: string, extra: Partial<Case> = {}): Case =>
  ({ id, name, ...loc, rock, aspect: 180, angle: 0, month, wx, dryHistory: true, evalHours: [8, 18], expect, confidence, source, seenInDesign: false, ...extra })
const FRESH_CRAG: Case[] = [
  fc('F1', 'Red River Gorge, October 68 °F', L.rrg, 'sandstone_quartz_arenite', 10, { hi: 68, lo: 48, dew: 50, wind: 5, cloud: 10 }, ['go'], 'Medium', CV),
  fc('F2', 'Red River Gorge, July 88 °F, dew point 72 °F', L.rrg, 'sandstone_quartz_arenite', 7, { hi: 88, lo: 70, dew: 72, wind: 3, cloud: 40 }, ['no'], 'High', `${CR}; ${CL}`),
  fc('F3', 'Red River Gorge, 36 h after 1" rain, sunny', L.rrg, 'sandstone_quartz_arenite', 10, { hi: 65, lo: 47, dew: 45, wind: 6, cloud: 10 }, ['go', 'marginal'], 'Medium', CV, { rain: [{ stopH: -24, inches: 1, durH: 8 }], evalHours: [12, 12] }),
  fc('F4', 'Smith Rock, January 45 °F, clear', L.smith, 'tuff_welded', 1, { hi: 45, lo: 28, dew: 25, wind: 4, cloud: 10 }, ['go'], 'Medium', CL),
  fc('F5', 'Smith Rock, August 95 °F', L.smith, 'tuff_welded', 8, { hi: 95, lo: 55, dew: 40, wind: 6, cloud: 0 }, ['no', 'marginal'], 'Medium', CL),
  fc('F6', 'Joshua Tree, December 55 °F', L.joshua, 'granite', 12, { hi: 55, lo: 35, dew: 20, wind: 6, cloud: 5 }, ['go'], 'High', CL),
  fc('F7', 'Joshua Tree, June 98 °F', L.joshua, 'granite', 6, { hi: 98, lo: 68, dew: 30, wind: 8, cloud: 0 }, ['no'], 'High', CL),
  fc('F8', 'Rumney, September 72 °F, dew point 58 °F, cloudy', L.rumney, 'gneiss_schist', 9, { hi: 72, lo: 55, dew: 58, wind: 4, cloud: 60 }, ['go', 'marginal'], 'Low', CR),
  fc('F9', 'Rumney, 6 h after 0.5" rain, grey', L.rumney, 'gneiss_schist', 9, { hi: 60, lo: 52, dew: 57, wind: 3, cloud: 90 }, ['no'], 'Medium', `${CV}; ${PH}`, { rain: [{ stopH: 6, inches: 0.5, durH: 4 }], evalHours: [12, 12] }),
  fc('F10', 'Squamish, August 78 °F, dry air', L.squamish, 'granite', 8, { hi: 78, lo: 58, dew: 52, wind: 6, cloud: 10 }, ['go', 'marginal'], 'Medium', CL),
  fc('F11', 'Squamish, 12 h after 1" rain, sunny 70 °F', L.squamish, 'granite', 8, { hi: 70, lo: 52, dew: 48, wind: 6, cloud: 10 }, ['go', 'marginal'], 'Medium', CV, { rain: [{ stopH: 0, inches: 1, durH: 8 }], evalHours: [12, 12] }),
  fc('F12', 'Fontainebleau, 20 h after 0.3" rain, grey March', L.font, 'sandstone_quartz_arenite', 3, { hi: 55, lo: 40, dew: 44, wind: 5, cloud: 80 }, ['no', 'marginal'], 'Medium', AF, { rain: [{ stopH: -8, inches: 0.3, durH: 3 }], evalHours: [12, 12] }),
  fc('F13', 'Kalymnos, May 80 °F, dew point 60 °F', L.kaly, 'limestone_dense', 5, { hi: 80, lo: 65, dew: 60, wind: 12, cloud: 5 }, ['marginal', 'no'], 'Low', `${CL}; ${CR}`),
  fc('F14', 'Kalymnos, October 72 °F, dew point 55 °F', L.kaly, 'limestone_dense', 10, { hi: 72, lo: 62, dew: 55, wind: 10, cloud: 10 }, ['go', 'marginal'], 'Medium', CL),
  fc('F15', 'Yosemite, November 58 °F', L.yos, 'granite', 11, { hi: 58, lo: 35, dew: 25, wind: 4, cloud: 10 }, ['go'], 'High', CL),
  fc('F16', 'New River Gorge, August 85 °F, dew point 68 °F', L.nrg, 'sandstone_quartz_arenite', 8, { hi: 85, lo: 68, dew: 68, wind: 3, cloud: 40 }, ['no'], 'High', `${CR}; ${CL}`),
  fc('F17', 'Red Rock, 48 h after 0.5" rain, January sun', L.rr, 'sandstone_eolian', 1, { hi: 55, lo: 35, dew: 22, wind: 5, cloud: 10 }, ['no', 'marginal'], 'Medium', `${AF} (Red Rock asks for a wait after rain)`, { rain: [{ stopH: -36, inches: 0.5, durH: 5 }], evalHours: [12, 12] }),
  fc('F18', 'Red Rock, 5 days after 0.5" rain, January sun', L.rr, 'sandstone_eolian', 1, { hi: 55, lo: 35, dew: 22, wind: 5, cloud: 10 }, ['go'], 'Medium', AF, { rain: [{ stopH: -108, inches: 0.5, durH: 5 }], evalHours: [12, 12] }),
]
const FRESH_WALL: Case[] = [
  fc('G1', 'Joshua Tree, south face, December noon', L.joshua, 'granite', 12, { hi: 55, lo: 35, dew: 20, wind: 6, cloud: 5 }, ['go'], 'High', CL, { aspect: 180, evalHours: [11, 14] }),
  fc('G2', 'Joshua Tree, north face, December', L.joshua, 'granite', 12, { hi: 50, lo: 30, dew: 20, wind: 6, cloud: 5 }, ['go', 'marginal'], 'Medium', CL, { aspect: 0 }),
  fc('G3', 'Squamish, south slab, August midday', L.squamish, 'granite', 8, { hi: 80, lo: 58, dew: 50, wind: 5, cloud: 0 }, ['no', 'marginal'], 'Low', `${CV} (slabs bake)`, { aspect: 180, angle: 30, evalHours: [12, 14] }),
  fc('G4', 'Squamish, north wall, August', L.squamish, 'granite', 8, { hi: 80, lo: 58, dew: 50, wind: 5, cloud: 0 }, ['go', 'marginal'], 'Medium', CL, { aspect: 0 }),
  fc('G5', 'Red River Gorge, overhang in all-day drizzle', L.rrg, 'sandstone_quartz_arenite', 10, { hi: 64, lo: 55, dew: 60, wind: 3, cloud: 100 }, ['go', 'marginal'], 'Medium', `${CV} (steep RRG walls stay dry in rain)`, { angle: -25, rain: [{ stopH: 17, inches: 0.4, durH: 12 }], evalHours: [10, 16] }),
  fc('G6', 'Red River Gorge, vertical wall, same drizzle', L.rrg, 'sandstone_quartz_arenite', 10, { hi: 64, lo: 55, dew: 60, wind: 3, cloud: 100 }, ['no'], 'High', PH, { angle: 0, rain: [{ stopH: 17, inches: 0.4, durH: 12 }], evalHours: [10, 16] }),
  fc('G7', 'Red Rock, north wall, January 45 °F', L.rr, 'sandstone_eolian', 1, { hi: 45, lo: 30, dew: 18, wind: 4, cloud: 5 }, ['go', 'marginal'], 'Medium', CL, { aspect: 0 }),
  fc('G8', 'Red Rock, south wall, July midday', L.rr, 'sandstone_eolian', 7, { hi: 100, lo: 76, dew: 35, wind: 6, cloud: 0 }, ['no'], 'High', CL, { aspect: 180, evalHours: [11, 15] }),
  fc('G9', 'Smith Rock, east wall, August morning', L.smith, 'tuff_welded', 8, { hi: 92, lo: 52, dew: 38, wind: 4, cloud: 0 }, ['go', 'marginal'], 'Low', `${CV} (chase the shade: east walls lose sun by midday)`, { aspect: 90, evalHours: [7, 10] }),
  fc('G10', 'Kalymnos, overhang, May 78 °F, light shower', L.kaly, 'limestone_dense', 5, { hi: 78, lo: 64, dew: 58, wind: 10, cloud: 50 }, ['go', 'marginal'], 'Low', CV, { angle: -35, rain: [{ stopH: 10, inches: 0.1, durH: 2 }], evalHours: [11, 16] }),
]

// ======================= Corrected drying clock (drynessD) =======================
// 1. Any measurable rain (>= 0.1 mm in the hour, Open-Meteo's resolution) wets the rock and earns no drying.
//    v2's clock only resets at 0.5 mm/h and keeps drying through drizzle.
// 2. Two stores: the surface (reset by every wetting) and the soak (topped up, never lowered, by a new storm).
//    A small shower after a big storm used to replace the big storm's load with its own.
// 3. Unknown rain in an hour: no drying credit, no wetting (clock stands still, as v2 does).
// 4. Optional snow: precipitation at <= 0.5 °C is stored and wets the rock again as it melts.
// Open-Meteo reports 0 or >= 0.1 mm; 0.05 keeps a scaled or float-rounded 0.1 from slipping under.
const WET_MM = 0.05
const trackCache = new WeakMap<HourlyConditions[], Map<string, (number | null)[]>>()
const rampR = (R: number, N: number) => (N <= 0 ? 1 : Math.pow(Math.max(0, N - R) / N, 2))
export type TrackState = { dryHistory: boolean; priorDryHours?: number }
function dryTrack(c: Case, series: HourlyConditions[], k: Knobs, built: Built): (number | null)[] {
  const maxH = dryingWindowHours(c.rock, Math.max(0, c.angle ?? 0)).maxHours * k.windowScale
  const needFor = (mm: number) => maxH * Math.min(1, Math.sqrt(mm / 25.4 / k.fullSoakIn))
  const start = c.dryHistory ? 0 : Math.max(0, maxH - (c.priorDryHours ?? 0))
  let deepR = start, deepN = maxH, surfR = start, surfN = maxH
  let storm = 0, lastWet = -1e9, swe = 0
  // An overhang sheds light rain: the shelter fraction was calibrated against a 0.5 mm/h wetting threshold, so it keeps it.
  const wetThr = (c.rainScale ?? 1) < 1 ? 0.5 : WET_MM
  // After an hour whose rain is unknown, withhold until a full soak would have dried.
  let unknownR = 0
  const out: (number | null)[] = []
  for (let i = 0; i < series.length; i++) {
    const h = built.hours[i]
    const p0 = h.precip_mm
    let wetMm: number | null = p0 === null || !Number.isFinite(p0) ? null : p0
    if (FIX.snow && wetMm !== null && h.air_temp_c !== null) {
      const ta = h.air_temp_c
      if (ta <= 0.5 && wetMm >= WET_MM) swe += wetMm
      else if (swe > 0 && ta > 0.5) {
        const melt = Math.min(swe, 0.15 * ta + 0.0015 * (h.shortwave_wm2 ?? 0))
        swe -= melt
        wetMm += melt
      }
    }
    if (wetMm === null) unknownR = maxH
    else {
      if (wetMm >= wetThr) {
        storm = i - lastWet < 24 ? storm + wetMm : wetMm
        lastWet = i
        const need = needFor(storm)
        surfR = surfN = need
        if (need >= deepR) { deepR = need; deepN = need }
      } else {
        const e1 = series[i].diagnostics.effective_dry_hours, e0 = i > 0 ? series[i - 1].diagnostics.effective_dry_hours : null
        const inc = e1 !== null && e0 !== null && e1 >= e0 ? e1 - e0 : 0
        surfR = Math.max(0, surfR - inc)
        unknownR = Math.max(0, unknownR - inc)
        deepR = Math.max(0, deepR - inc)
      }
    }
    if (series[i].diagnostics.effective_dry_hours === null || wetMm === null || unknownR > 0) { out.push(null); continue }
    let d = Math.min(rampR(surfR, surfN), rampR(deepR, deepN))
    // Snow still lying on the crag: not climbable, however dry the rock between patches.
    if (FIX.snow && swe >= 1) d = Math.min(d, 0.25)
    if (c.seeps && storm / 25.4 >= 0.75 && i - lastWet < c.seeps.days * 24) d = Math.min(d, 0.25)
    out.push(d)
  }
  return out
}
function drynessD(c: Case, series: HourlyConditions[], k: Knobs, built: Built, i: number) {
  let m = trackCache.get(series)
  if (!m) { m = new Map(); trackCache.set(series, m) }
  const key = JSON.stringify([c.rock, c.angle ?? 0, k.fullSoakIn, k.windowScale, c.seeps, c.dryHistory, c.priorDryHours, FIX.snow])
  let t = m.get(key)
  if (!t) { t = dryTrack(c, series, k, built); m.set(key, t) }
  return t[i]
}

// ======================= Error hunt =======================
import { readFileSync, existsSync } from 'node:fs'
// Run from apps/api/src/scripts/ (see README); the data sits beside this file in the repo.
const WX = new URL('../../../../.claude/docs/crag-a-reference/wx', import.meta.url).pathname
const CRAGS_REAL: { name: string; rock: RockType; lat: number; lon: number }[] = [
  { name: 'redrock', rock: 'sandstone_eolian', lat: 36.13, lon: -115.43 }, { name: 'joshua', rock: 'granite', lat: 34.01, lon: -116.17 },
  { name: 'squamish', rock: 'granite', lat: 49.68, lon: -123.15 }, { name: 'rrg', rock: 'sandstone_quartz_arenite', lat: 37.78, lon: -83.68 },
  { name: 'smith', rock: 'tuff_welded', lat: 44.37, lon: -121.14 }, { name: 'rumney', rock: 'gneiss_schist', lat: 43.8, lon: -71.84 },
  { name: 'yosemite', rock: 'granite', lat: 37.73, lon: -119.6 }, { name: 'font', rock: 'sandstone_quartz_arenite', lat: 48.44, lon: 2.64 },
  { name: 'kalymnos', rock: 'limestone_dense', lat: 36.98, lon: 26.98 }, { name: 'newriver', rock: 'sandstone_quartz_arenite', lat: 38.07, lon: -81.08 },
]
const MODS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless']
function loadReal(name: string, m: string) {
  const f = `${WX}/${name}_${m}.json`
  if (!existsSync(f)) return null
  let j: { hourly?: Record<string, (number | null)[]> & { time: string[] }; utc_offset_seconds?: number }
  try { j = JSON.parse(readFileSync(f, 'utf8')) } catch { return null }
  if (!j.hourly) return null
  const off = (j.utc_offset_seconds ?? 0) / 3600, h = j.hourly
  const hours: WeatherHour[] = h.time.map((t, i) => ({ valid_at: new Date(Date.parse(t + 'Z') - off * 3600e3).toISOString(), air_temp_c: h.temperature_2m[i], dewpoint_c: h.dew_point_2m[i], wind_kmh: h.wind_speed_10m[i], cloud_pct: h.cloud_cover[i], shortwave_wm2: h.shortwave_radiation[i], precip_mm: h.precipitation[i] }))
  return { hours, off }
}
const REAL = CRAGS_REAL.flatMap((cr) => MODS.map((m) => ({ cr, m, r: loadReal(cr.name, m) })).filter((x) => x.r !== null)) as { cr: typeof CRAGS_REAL[number]; m: string; r: { hours: WeatherHour[]; off: number } }[]
const realCase = (x: typeof REAL[number], extra: Partial<Case> = {}): Case => ({ id: `${x.cr.name}:${x.m}`, name: x.cr.name, rock: x.cr.rock, lat: x.cr.lat, lon: x.cr.lon, aspect: 180, angle: 0, month: 9, wx: FALL, dryHistory: false, evalHours: [8, 18], expect: ['go'], confidence: 'Low', source: '', seenInDesign: false, real: { hours: x.r.hours, offsetH: x.r.off }, ...extra })

type Finding = { hunt: string; model: string; what: string; detail: string }
const syn = (id: string, rock: RockType, wx: Wx, extra: Partial<Case> = {}): Case => ({ id, name: id, rock, aspect: 180, angle: 0, month: 10, wx, dryHistory: true, evalHours: [12, 12], expect: ['go'], confidence: 'Low', source: '', seenInDesign: false, ...extra })
const hourAt = (c: Case, lh: number) => HISTORY_DAYS * 24 + lh
const MODELS = ['CA', 'WA'] as const
const sc = (o: 'CA' | 'WA', c: Case, i: number) => { const s = hourScoreOpt(o, c, i); return s === null ? null : Math.round(s) }

function hunt(): { findings: Finding[]; counts: Record<string, number> } {
  const F: Finding[] = []
  const counts: Record<string, number> = {}
  const add = (hunt: string, model: string, what: string, detail: string) => { F.push({ hunt, model, what, detail }); counts[hunt] = (counts[hunt] ?? 0) + 1 }
  const ROCKS: RockType[] = ['granite', 'gneiss_schist', 'limestone_dense', 'sandstone_quartz_arenite', 'limestone_porous', 'sandstone_eolian', 'sandstone_soft']

  // H1: light rain falling now. Rock under any measurable rain is wet.
  for (const rate of [0.1, 0.2, 0.3, 0.4, 0.49]) for (const rock of ROCKS) for (const gap of [0.5, 1.5, 3]) {
    const c = syn(`H1 ${rate}mm/h ${rock} dewgap${gap}`, rock, MILD_GREY, { rain: [{ stopH: 16, inches: (rate * 10) / 25.4, durH: 10 }], rainDewGapC: gap, evalHours: [7, 15] })
    for (const o of MODELS) {
      let worst = -1, at = -1
      for (let lh = 7; lh <= 15; lh++) { const s = sc(o, c, hourAt(c, lh)); if (s !== null && s > worst) { worst = s; at = lh } }
      if (worst >= 40) add('H1 drizzle scored as climbable', o, `${rate} mm/h, ${rock}, dew ${gap} °C under air`, `best hour under rain ${at}:00 scores ${worst}`)
    }
  }

  // H2: more rain must never score higher, same timing.
  for (const rock of ROCKS) for (const wx of [SUNNY, GREY]) for (const hist of [true, false]) {
    const sizes = [0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6]
    for (const o of MODELS) {
      let prev: number | null = null, prevSize = 0
      for (const inch of sizes) {
        const c = syn(`H2 ${rock} ${inch}`, rock, wx, { rain: inch > 0 ? [{ stopH: -12, inches: inch, durH: Math.max(1, Math.round(inch * 10)) }] : [], dryHistory: hist, ...(hist ? {} : { priorDryHours: 0 }) })
        const s = sc(o, c, hourAt(c, 12))
        if (prev !== null && s !== null && s > prev + 1) add('H2 more rain scores higher', o, `${rock}, ${wx === SUNNY ? 'sunny' : 'grey'}, history ${hist ? 'dry' : 'unknown'}`, `${prevSize}" → ${prev}, ${inch}" → ${s}`)
        prev = s; prevSize = inch
      }
    }
  }

  // H3: longer since rain must never score lower, same weather.
  for (const rock of ROCKS) for (const wx of [SUNNY, GREY]) for (const inch of [0.1, 0.5, 1.2]) for (const o of MODELS) {
    let prev: number | null = null, prevH = 0
    for (let since = 2; since <= 168; since += 2) {
      const c = syn(`H3`, rock, wx, { rain: [{ stopH: 12 - since, inches: inch, durH: 4 }] })
      const s = sc(o, c, hourAt(c, 12))
      if (prev !== null && s !== null && s < prev - 1) { add('H3 score falls as rock dries', o, `${rock}, ${inch}", ${wx === SUNNY ? 'sunny' : 'grey'}`, `${prevH} h → ${prev}, ${since} h → ${s}`); break }
      prev = s; prevH = since
    }
  }

  // H4: a small shower after a big storm must not make the rock read drier.
  for (const rock of ROCKS) for (const shower of [{ inch: 0.02, dur: 1 }, { inch: 0.05, dur: 2 }, { inch: 0.1, dur: 3 }, { inch: 0.1, dur: 1 }]) for (const o of MODELS) {
    const big = { stopH: -48, inches: 1, durH: 8 }
    const a = syn('H4a', rock, SUNNY, { rain: [big] })
    const b = syn('H4b', rock, SUNNY, { rain: [big, { stopH: -20, inches: shower.inch, durH: shower.dur }] })
    for (let lh = 8; lh <= 18; lh++) {
      const sa = sc(o, a, hourAt(a, lh)), sb = sc(o, b, hourAt(b, lh))
      if (sa !== null && sb !== null && sb > sa + 1) { add('H4 later shower erases a soak', o, `${rock}, 1" storm 60 h ago then ${shower.inch}" over ${shower.dur} h`, `${lh}:00 without shower ${sa}, with shower ${sb}`); break }
    }
  }

  // H5: no steps. Sweep the day's high and dew point in 0.2 °F.
  for (const o of MODELS) {
    let prev: number | null = null, maxJ = 0, at = ''
    for (let hi = 20; hi <= 110; hi += 0.2) {
      const c = syn('H5', 'granite', { hi, lo: hi - 18, dew: Math.min(hi - 20, 50), wind: 5, cloud: 10 }, { evalHours: [8, 18] })
      const s = dayBest(c, (i) => hourScoreOpt(o, c, i))
      if (prev !== null && s !== null && Math.abs(s - prev) > maxJ) { maxJ = Math.abs(s - prev); at = `high ${hi.toFixed(1)} °F` }
      if (prev !== null && s !== null && hi > 62 && s > prev + 1) add('H5m hotter scores higher', o, 'granite, dry', `high ${hi.toFixed(1)} °F: ${prev} → ${s}`)
      if (prev !== null && s !== null && hi < 36 && s < prev - 1) add('H5m colder scores higher', o, 'granite, dry', `high ${hi.toFixed(1)} °F: ${prev} → ${s}`)
      prev = s
    }
    if (maxJ > 2) add('H5 step in temperature', o, 'granite, dry', `${maxJ} points at ${at}`)
    prev = null; maxJ = 0
    for (let dew = 10; dew <= 74; dew += 0.2) {
      const c = syn('H5d', 'granite', { hi: 76, lo: 60, dew, wind: 5, cloud: 10 }, { evalHours: [8, 18] })
      const s = dayBest(c, (i) => hourScoreOpt(o, c, i))
      if (prev !== null && s !== null && Math.abs(s - prev) > maxJ) { maxJ = Math.abs(s - prev); at = `dew ${dew.toFixed(1)} °F` }
      if (prev !== null && s !== null && s > prev + 1) add('H5m more humid scores higher', o, 'granite, 76 °F', `dew ${dew.toFixed(1)} °F: ${prev} → ${s}`)
      prev = s
    }
    if (maxJ > 2) add('H5 step in dew point', o, 'granite, dry', `${maxJ} points at ${at}`)
    prev = null; maxJ = 0
    for (let inch = 0; inch <= 0.6; inch += 0.002) {
      const c = syn('H5r', 'sandstone_soft', SUNNY, { rain: inch > 0 ? [{ stopH: -12, inches: inch, durH: 3 }] : [] })
      const s = sc(o, c, hourAt(c, 12))
      if (prev !== null && s !== null && Math.abs(s - prev) > maxJ) { maxJ = Math.abs(s - prev); at = `${inch.toFixed(3)}"` }
      prev = s
    }
    if (maxJ > 3) add('H5 step in rain amount', o, 'soft sandstone, 24 h after', `${maxJ} points at ${at}`)
  }

  // H6: a gap in an input must never raise the score.
  for (const x of REAL.slice(0, 6)) for (const o of MODELS) for (const field of ['precip_mm', 'dewpoint_c', 'air_temp_c', 'shortwave_wm2', 'wind_kmh', 'cloud_pct'] as const) {
    const n = x.r.hours.length
    const wet = x.r.hours.map((h, i) => ((h.precip_mm ?? 0) >= 0.1 ? i : -1)).filter((i) => i >= 0)
    const starts = field === 'precip_mm' && wet.length ? wet.slice(0, 6) : [n - 200, n - 150, n - 100, n - 60]
    for (const s0 of starts) {
      const hours = x.r.hours.map((h, i) => (i >= s0 && i < s0 + 6 ? { ...h, [field]: null } : h))
      const base = realCase(x), gap = realCase(x, { id: `${x.cr.name}:${x.m}:gap:${field}:${s0}`, real: { hours, offsetH: x.r.off } })
      for (let i = s0; i < Math.min(n, s0 + 48); i++) {
        const a = sc(o, base, i), b = sc(o, gap, i)
        if (a !== null && b !== null && b > a + 1) { add('H6 missing input raises score', o, `${x.cr.name} ${x.m}, ${field} blank for 6 h`, `hour +${i - s0}: ${a} → ${b}`); break }
      }
    }
  }

  // H7: rain falling in a real forecast hour while the score says climbable.
  for (const x of REAL) for (const o of MODELS) {
    const c = realCase(x)
    const b = buildSeries(c)
    let n = 0, ex = ''
    for (let i = 0; i < b.hours.length; i++) {
      const p = b.hours[i].precip_mm ?? 0
      if (p < 0.1 || b.localHour[i] < 8 || b.localHour[i] > 18) continue
      const s = sc(o, c, i)
      if (s !== null && s >= 40) { n++; if (!ex) ex = `${b.hours[i].valid_at} ${p} mm → ${s}` }
    }
    if (n) add('H7 real rain hour scored climbable', o, `${x.cr.name} ${x.m}`, `${n} daylight hours, e.g. ${ex}`)
  }

  // H8: overhang shelter on real forecasts.
  for (const x of REAL) {
    const b = buildSeries(realCase(x))
    const wetIdx = b.hours.map((h, i) => ((h.precip_mm ?? 0) >= 0.1 ? i : -1)).filter((i) => i >= 0)
    if (!wetIdx.length) continue
    const vert = realCase(x, { angle: 0 }), over = realCase(x, { angle: -30 })
    let diff = 0, scored = 0
    for (const i of wetIdx) for (let j = i; j < Math.min(b.hours.length, i + 12); j++) { const sv = sc('WA', vert, j), so = sc('WA', over, j); if (sv === null || so === null) continue; scored++; if (sv !== so) diff++ }
    if (scored > 0 && diff === 0) add('H8 overhang shelter ignored on real forecasts', 'WA', `${x.cr.name} ${x.m}`, `30° overhang scores the same as a vertical wall through ${wetIdx.length} wet hours`)
  }

  // H9: snow. 0.6" of water as snow, then two sunny days just above freezing.
  for (const rock of ['granite', 'sandstone_quartz_arenite'] as RockType[]) for (const o of MODELS) {
    const c = syn('H9', rock, { hi: 42, lo: 24, dew: 18, wind: 4, cloud: 5 }, { month: 1, historyWx: { hi: 28, lo: 16, dew: 14, wind: 5, cloud: 90 }, rain: [{ stopH: -36, inches: 0.6, durH: 10 }], evalHours: [8, 18] })
    const s = dayBest(c, (i) => hourScoreOpt(o, c, i))
    if (s !== null && s >= 60) add('H9 snow ignored', o, `${rock}, 0.6" as snow 36 h before, sunny 42 °F`, `scores ${s} (Go) while the snow is still melting onto the rock`)
  }

  // H10: unknown rain history (app has ~5 trailing days, #176). Dry crag should not read wet.
  const NOW = Date.parse('2026-09-24T12:00:00Z')
  for (const x of REAL) for (const o of ['CA'] as const) {
    const full = realCase(x)
    const bf = buildSeries(full)
    const cut = bf.hours.findIndex((h) => Date.parse(h.valid_at) >= NOW - 5 * 86400e3)
    const app = realCase(x, { id: `${x.cr.name}:${x.m}:app`, real: { hours: x.r.hours.slice(cut), offsetH: x.r.off } })
    const ba = buildSeries(app)
    const t0 = ba.hours.findIndex((h) => Date.parse(h.valid_at) >= NOW)
    let n = 0, ex = ''
    for (let i = t0; i < ba.hours.length; i++) {
      if (ba.localHour[i] < 8 || ba.localHour[i] > 18) continue
      const a = sc(o, app, i), f = sc(o, full, i + cut)
      if (a !== null && f !== null && verdict(a) !== verdict(f)) { n++; if (!ex) ex = `${ba.hours[i].valid_at} full history ${f}, 5-day window ${a}` }
    }
    if (n) add('H10 short history changes verdict', o, `${x.cr.name} ${x.m}`, `${n} daylight hours, e.g. ${ex}`)
  }
  // H13: a 30° overhang stays climbable in light rain and gets wet in a downpour.
  for (const [rate, expectWet] of [[0.3, false], [0.8, false], [8, true]] as [number, boolean][]) {
    const c = syn(`H13 ${rate}`, 'limestone_dense', MILD_GREY, { angle: -30, rain: [{ stopH: 16, inches: (rate * 10) / 25.4, durH: 10 }], rainDewGapC: 1.5, evalHours: [9, 15] })
    const hs: number[] = []
    for (let lh = 9; lh <= 15; lh++) { const v = sc('WA', c, hourAt(c, lh)); if (v !== null) hs.push(v) }
    const best = Math.max(...hs)
    if (expectWet && best >= 40) add('H13 overhang dry in a downpour', 'WA', `${rate} mm/h`, `best hour ${best}`)
    if (!expectWet && best < 40) add('H13 overhang wet in light rain', 'WA', `${rate} mm/h`, `best hour ${best}`)
  }
  // H11: real forecast days that reach 90 °F yet read Go.
  for (const x of REAL) for (const o of ['CA'] as const) {
    const c = realCase(x), b = buildSeries(c)
    for (const d of [...new Set(b.dayIdx)]) {
      const idx = b.hours.map((_, i) => i).filter((i) => b.dayIdx[i] === d && b.localHour[i] >= 8 && b.localHour[i] <= 18)
      if (idx.length < 11) continue
      const maxT = Math.max(...idx.map((i) => b.hours[i].air_temp_c ?? -99))
      if (maxT < 32.2) continue
      const hs = idx.map((i) => sc(o, c, i))
      const W = Math.max(1, FIX.window)
      let best: number | null = null
      for (let a = 0; a + W <= hs.length; a++) { const run = hs.slice(a, a + W); if (run.some((v) => v === null)) continue; const m = Math.min(...(run as number[])); if (best === null || m > best) best = m }
      if (best !== null && best >= 60) add('H11 90 °F day reads Go', o, `${x.cr.name} ${x.m}`, `day ${d}, high ${cToF(maxT).toFixed(0)} °F, day score ${best} (hours 8-18: ${hs.join(' ')})`)
    }
  }
  // H12: local clock. The sunniest hour of the day should fall near local noon.
  for (const x of REAL) {
    const b = buildSeries(realCase(x))
    const sum = new Array(24).fill(0)
    b.hours.forEach((h, i) => { sum[b.localHour[i]] += h.shortwave_wm2 ?? 0 })
    const peak = sum.indexOf(Math.max(...sum))
    if (peak < 11 || peak > 15) add('H12 local clock off', '-', `${x.cr.name} ${x.m}`, `sunniest hour is ${peak}:00 local`)
  }
  return { findings: F, counts }
}

// ---- noise and real-forecast summary ----
let seed = 42
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd())
function perturb(c: Case, j: number): Case {
  const dT = gauss() * 2.7, dD = gauss() * 2.7
  const wx: Wx = { ...c.wx, hi: c.wx.hi + dT, lo: c.wx.lo + dT, dew: c.wx.dew + dD, wind: Math.max(0, c.wx.wind * (0.7 + 0.6 * rnd())), cloud: Math.min(100, Math.max(0, c.wx.cloud + (rnd() - 0.5) * 40)) }
  const rain = c.rain?.map((r) => ({ ...r, inches: r.inches * (0.6 + 0.8 * rnd()) }))
  return { ...c, id: `${c.id}~${j}`, wx, rain, historyWx: c.historyWx ? { ...c.historyWx, hi: c.historyWx.hi + dT, lo: c.historyWx.lo + dT, dew: c.historyWx.dew + dD } : undefined }
}
function noise() {
  const out: Record<string, string> = {}
  for (const [g, cases, o] of [['crag', [...CRAG, ...FRESH_CRAG], 'CA'], ['wall', [...WALLS, ...FRESH_WALL], 'WA']] as [string, Case[], 'CA' | 'WA'][]) {
    let flips = 0, n = 0, right = 0
    for (const c of cases) {
      const base = optDay(o, c)
      seed = [...c.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 2147483647
      for (let j = 0; j < 12; j++) { const s2 = optDay(o, perturb(c, j)); n++; if (verdict(s2) !== verdict(base)) flips++; if ((c.expect as string[]).includes(verdict(s2))) right++ }
    }
    out[`${g}:${o}`] = `flips ${((100 * flips) / n).toFixed(1)}% right ${Math.round((100 * right) / n)}%`
  }
  return out
}
function realSummary() {
  const NOW = Date.parse('2026-09-24T12:00:00Z')
  const days: Record<string, (number | null)[]> = {}
  let go = 0, total = 0
  for (const x of REAL) {
    const c = realCase(x), b = buildSeries(c)
    const t0 = b.hours.findIndex((h) => Date.parse(h.valid_at) >= NOW), d0 = b.dayIdx[t0]
    const row: (number | null)[] = []
    for (let d = d0; d < d0 + 7; d++) {
      const idx = b.hours.map((_, i) => i).filter((i) => b.dayIdx[i] === d && b.localHour[i] >= 8 && b.localHour[i] <= 18)
      const hs = idx.map((i) => hourScoreOpt('CA', c, i))
      const W = Math.max(1, FIX.window)
      let best: number | null = null
      for (let a = 0; a + W <= hs.length; a++) { const run = hs.slice(a, a + W); if (run.some((v) => v === null)) continue; const m = Math.min(...(run as number[])); if (best === null || m > best) best = m }
      const v = best === null ? null : Math.round(best)
      row.push(v); if (v !== null) { total++; if (v >= 60) go++ }
    }
    days[`${x.cr.name}:${x.m}`] = row
  }
  let same = 0, n = 0
  for (const cr of CRAGS_REAL) {
    const have = MODS.filter((m) => days[`${cr.name}:${m}`])
    for (let a = 0; a < have.length; a++) for (let b2 = a + 1; b2 < have.length; b2++) days[`${cr.name}:${have[a]}`].forEach((x, d) => { const y = days[`${cr.name}:${have[b2]}`][d]; if (x === null || y === null) return; n++; if (verdict(x) === verdict(y)) same++ })
  }
  return { days, goRate: `${Math.round((100 * go) / total)}% of ${total}`, agree: `${Math.round((100 * same) / n)}% of ${n}` }
}

// ---- accuracy on every test set, to check corrections cost nothing ----
function accuracy() {
  const sets: [string, Case[], ('CA' | 'WA')[]][] = [['crag', CRAG, ['CA']], ['fresh crag', FRESH_CRAG, ['CA']], ['wall', WALLS, ['CA', 'WA']], ['fresh wall', FRESH_WALL, ['CA', 'WA']]]
  const out: Record<string, string> = {}
  for (const [label, cases, ms] of sets) for (const m of ms) {
    const g = gradeScores(cases, Object.fromEntries(cases.map((c) => [c.id, optDay(m, c)])))
    out[`${label}:${m}`] = `${g.hits}/${g.n} dist ${g.dist} falseGo ${g.falseGo.join(',') || '-'} miss ${g.misses.join(',') || '-'}`
  }
  return out
}

const modes: [string, typeof FIX][] = [
  ['as picked', { dry: false, snow: false, shelterReal: false, window: 0 }],
  ['corrected', { dry: true, snow: true, shelterReal: true, window: 3 }],
]
const result: Record<string, unknown> = {}
for (const [label, f] of modes) {
  Object.assign(FIX, f)
  vCache.clear()
  const h = hunt()
  const acc = accuracy()
  const nz = noise()
  const real = realSummary()
  result[label] = { ...h, acc, noise: nz, real }
  console.log(`\n===== ${label} =====`)
  console.log('counts', JSON.stringify(h.counts))
  const seen = new Set<string>()
  for (const x of h.findings) { const k = `${x.hunt}|${x.model}`; if (seen.has(k)) continue; seen.add(k); console.log(` [${x.model}] ${x.hunt}: ${x.what} :: ${x.detail}`) }
  console.log('accuracy', JSON.stringify(acc, null, 1))
  console.log('noise', JSON.stringify(nz), 'real Go', real.goRate, 'model agreement', real.agree)
  for (const [k, r] of Object.entries(real.days)) console.log('  ', k.padEnd(24), r.join(' '))
}
writeFileSync(OUT, JSON.stringify(result))
