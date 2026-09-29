/**
 * WeatherTeam6 — Design Tokens
 * Extracted from: design_handoff_crux_conditions (radar.css, walls.css, trips.css, README).
 * Those mockup files were deleted on 2026-09-23 — recover them from the
 * `archive/2026-09-23-pre-cleanup` tag. Canonical source was the `.crux-phone`
 * CSS custom properties block in radar.css.
 * Target: React Native (StyleSheet / inline styles)
 *
 * Usage:
 *   import { colors, type, spacing, radius, shadow } from '@weatherteam6/design/tokens'
 */

// ─────────────────────────────────────────────
// COLORS
// ─────────────────────────────────────────────

export const colors = {
  // Background
  /** Screen background — use as LinearGradient start/mid/end */
  bgGradientTop: '#4a5568',
  bgGradientMid: '#1a202c',
  bgGradientBottom: '#0d1117',

  /** Radar map canvas / deep wells */
  mapCanvas: '#0a0e14',

  // Text hierarchy
  /** Hero / primary text, stat values */
  txt1: '#f0f4f8',
  /** Body copy / stat values — min opacity 0.82 */
  txt2: 'rgba(226,232,240,0.82)',
  /** Subtitles / meta — min opacity 0.62 */
  txt3: 'rgba(226,232,240,0.62)',
  /** Labels / keys — min opacity 0.50 */
  txt4: 'rgba(226,232,240,0.50)',
  /** Time-axis ticks ONLY — reserved, do not use elsewhere */
  txt5: 'rgba(226,232,240,0.38)',

  // Surfaces
  /** Default card background */
  card: 'rgba(255,255,255,0.07)',
  /** Raised / active card background */
  card2: 'rgba(255,255,255,0.10)',

  // Borders
  /** Default border */
  line: 'rgba(226,232,240,0.14)',
  /** Stronger border / input outline */
  line2: 'rgba(226,232,240,0.22)',

  // Status / conditions
  /** Good conditions, primary action, high confidence (lime) */
  good: '#b8f542',
  /** Fair conditions, medium confidence (amber) */
  fair: '#f6ad55',
  /** Poor conditions, severe weather, compass N (red) */
  poor: '#fc8181',
  /** Precip / rain accents, info-blue */
  rain: 'rgba(144,205,244,0.95)',
  /** Sun window / direct-sun viz */
  sun: 'rgba(253,186,116,0.9)',

  // On-lime text (lime fill backgrounds only)
  /** Text color when rendered on a --good (lime) fill */
  onGood: '#0d1117',

  // Radar intensity ramp (precip echoes)
  radarLight: 'rgba(99,179,237,0.65)',
  radarModerate: 'rgba(63,131,248,0.75)',
  radarBand: 'rgba(59,130,246,0.15)',
  radarHeavy: 'rgba(246,173,85,0.80)',    // amber — maps to --fair language
  radarSevere: 'rgba(252,129,129,0.85)',  // red — maps to --poor language

  // Interactive / selection states
  /** Active lime tint background (chips, selected rows) */
  goodTint: 'rgba(184,245,66,0.10)',
  /** Active lime tint border */
  goodTintBorder: 'rgba(184,245,66,0.28)',
  /** Stronger lime tint (in-range calendar cells) */
  goodTintStrong: 'rgba(184,245,66,0.14)',
  /** Selected lime tint (crag option selected) */
  goodTintSelected: 'rgba(184,245,66,0.08)',
  goodTintSelectedBorder: 'rgba(184,245,66,0.30)',

  /** Fair tint background */
  fairTint: 'rgba(246,173,85,0.10)',
  /** Sun tint background */
  sunTint: 'rgba(253,186,116,0.10)',
} as const;

/**
 * The v2 surface palette — **dark only**, from the WT6 Figma file's "V2" page
 * (2026-09). The light variant on the same page lands in its own pass.
 *
 * **Opaque layers instead of the gradient and its translucent cards.** v2 asked
 * for more contrast in dark: a near-black ground, one step up for bands and
 * wells, one more for cards, and a visible hairline. The status hues are
 * `colors.good`/`fair`/`poor` unchanged; what v2 adds is an *ink* for each —
 * a lighter tone for text set on that hue's own tint, where the base hue reads
 * dim.
 *
 * `poorInk` was first derived by lightening `poor`, when the Locations frame
 * showed no poor score; the Overview frame's day pill draws one, and `poorInk`
 * is now its colour.
 */
export const colorsV2 = {
  /** Screen ground. */
  bg: '#07090c',
  /** Header band, legend strip, and the wells chips sit in. */
  surface: '#10161d',
  /** Card fill. */
  card: '#171f28',
  /** Hairline on cards, chips and controls. */
  line: '#2a3644',
  /** Primary text. */
  txt1: '#f4f7fa',
  /** Secondary text — meta, legend, the card chevron. */
  txtMuted: '#8e9aa8',
  /** Text on a `good` tint. */
  goodInk: '#c8f76a',
  /** Text on a `fair` tint. */
  fairInk: '#f8bd72',
  /** Text on a `poor` tint. */
  poorInk: '#ff8b91',
  /** A well inside a card: the hour cells of the Overview's Today strip. */
  raised: '#1f2833',
  /** Secondary text on a tinted surface: the hero's high/low and weather line. */
  txt2: '#cfdad2',
  /** An unselected tab. */
  txtTab: '#7d8997',
  /** Chance of rain, as a figure. Also the dew point line on the Hourly tab. */
  rain: '#90cdf4',
  /** A chart's value gridlines, on the Hourly tab. */
  grid: '#232e3b',
  /** A chart legend's words, and the sustained-wind line. */
  legend: '#c9d2dc',
  /** The humidity line. */
  humidity: '#7fd1c4',
  /**
   * `good` friction on the Hourly tab's friction strip — between the lime of
   * `great` (`colors.good`) and `fair`, so four levels read as an ordering.
   */
  frictionGood: '#d7f59a',
  /**
   * Snow, and rain and snow together, on the Precip tab — beside `rain`.
   * The Figma frame draws a mixed event in `fair` amber; that colour is the
   * conditions ladder's and is not available for a data mark, so the kinds
   * take their own hues, cooler to warmer: rain, mix, snow.
   */
  precipMix: '#b794f4',
  precipSnow: '#e2dcfb',
} as const;

/**
 * The status ladder as **surfaces**: each rung's tinted card, row and pill,
 * from the Overview frame of the WT6 Figma "V2" page.
 *
 * Opaque, not `withOpacity` over the ground: the Figma's values are hand-picked
 * and a computed tint lands visibly off them. `good` is the Figma's own. The
 * frame draws `fair` and `poor` only as the day row and its pill; their `hero`
 * and `heroMuted` are the row tint and a neutral muted ink, since the frame
 * shows no hero on either rung.
 */
export const toneSurfacesV2 = {
  good: {
    hero: '#132a1f',
    heroLine: 'rgba(184,245,66,0.35)',
    heroRule: '#2a4034',
    heroMuted: '#93a69a',
    heroBand: 'rgba(184,245,66,0.13)',
    row: '#111d18',
    pill: '#213d28',
    pillLine: '#3e6b43',
    pillInk: '#b8f542',
  },
  fair: {
    hero: '#1d1912',
    heroLine: 'rgba(246,173,85,0.35)',
    heroRule: '#40331f',
    heroMuted: '#a69a8a',
    heroBand: 'rgba(246,173,85,0.13)',
    row: '#1d1912',
    pill: '#3a2b17',
    pillLine: '#7a5727',
    pillInk: '#f8bd72',
  },
  poor: {
    hero: '#211416',
    heroLine: 'rgba(252,129,129,0.35)',
    heroRule: '#40262a',
    heroMuted: '#a68e91',
    heroBand: 'rgba(252,129,129,0.13)',
    row: '#211416',
    pill: '#432126',
    pillLine: '#7a3438',
    pillInk: '#ff8b91',
  },
} as const;

export const uvScale = [
  '#4ade80', '#86efac', '#fde047', '#fbbf24', '#fb923c',
  '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#7c3aed', '#6d28d9',
] as const

/**
 * Wind speed, as a single-hue magnitude ramp: calm to strong.
 *
 * **Not diverging, and not the status hues.** There is no ideal wind to diverge
 * around — the score's wind component is monotonic, full marks at or below
 * 15 km/h and zero at or above 50 — so one hue getting brighter is the honest
 * encoding of a magnitude. Two stops, interpolated like `tempScale`.
 */
export const windScale = ['#a0aec0', '#f0f4f8'] as const;

/**
 * Chance of rain, as a single-hue ramp across 0-100% of ensemble members.
 *
 * **Its own scale, and it has to be.** The radar intensity ramp's thresholds
 * are *rates* in mm/h; feeding a percentage into it reaches two of its four
 * steps and puts a hard break at exactly 50%, above which 51% and 100% are the
 * same colour. A probability is not a rate.
 */
export const chanceScale = ['#2c5282', '#63b3ed'] as const;

/**
 * Route difficulty on the guidebook screens, easiest band first: 5.9 and under,
 * 5.10, 5.11, 5.12, 5.13 and up (`GRADE_BANDS` in `packages/types`).
 *
 * **The WT6 Figma's own colours, by owner decision 2026-09-29** — blue, teal,
 * lime, amber, red, exactly as the "03 · Guidebook Flow" Crag frame draws them.
 * Three of them are `colors.good`/`fair`/`poor`, which the rule reserves for the
 * conditions ladder; the owner chose these over a single-hue violet ramp that
 * kept them apart, so **the exception covers grade marks only** — a grade bar,
 * column, legend swatch or chip, always beside its printed grade or count. No
 * other data mark borrows the status hues on the strength of this.
 */
export const gradeScale = ['#90cdf4', '#7fd1c4', '#b8f542', '#f6ad55', '#fc8181'] as const;

/**
 * Boulder problems beside `gradeScale` — the Figma's violet, which is also
 * `colorsV2.precipMix`. Off the ramp because a V grade is not on that scale: a
 * V4 is not "harder than 5.13", and a sixth step would say it is.
 */
export const gradeBoulder = '#b794f4';

/**
 * Air temperature, as a **diverging ramp around the ideal climbing temperature**.
 *
 * A named scale rather than five loose colours, exactly as `uvScale` above is — it is one
 * encoding, and splitting it across five token names would let a consumer use half of it.
 *
 * Offsets are **degrees Fahrenheit from ideal**, matching the mockup this was lifted from:
 * neutral at ideal, cool below, warm then hot above. Interpolate *between* the stops — the
 * ramp is continuous, which is what lets `fair` and `poor` sit next to each other in it
 * without being confusable. As discrete steps they measure ΔE 13.0 apart, below the floor
 * for telling two hues apart, and that was a real defect in the first Phase 3 build.
 *
 * `rain`, `fair` and `poor` are the palette's own values, repeated here as literals only
 * because a ramp has to be a flat list of stops. The two ends are new.
 */
export const tempScale = [
  { offsetF: -25, color: '#4299e1' },  // deep blue — too cold to pull hard
  { offsetF: -8,  color: '#90cdf4' },  // = colors.rain
  { offsetF: 0,   color: '#cbd5e0' },  // neutral ink — ideal
  { offsetF: 22,  color: '#f6ad55' },  // = colors.fair
  { offsetF: 48,  color: '#fc8181' },  // = colors.poor — too hot for the rubber
] as const

// ─────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────
// Load via expo-font: 'BarlowCondensed-*' and 'Barlow-*'
// Google Fonts: Barlow Condensed (400/500/600/700), Barlow (400/500/600)

/**
 * `mono` is v2's figure face — every number on a v2 card. Tabular figures, so a
 * column of scores or temperatures lines up without padding.
 */
export const fonts = {
  mono: 'IBMPlexMono',
  /** Display / UI — headings, stat values, labels, nav, buttons */
  display: 'BarlowCondensed',
  /** Body / running copy — sentences, hints, metadata, provenance */
  body: 'Barlow',
} as const;

export const type = {
  /** Screen title: 30/700, tracking -0.01em */
  screenTitle: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '700' as const,
    letterSpacing: -0.3, // -0.01em @ 30px
    color: colors.txt1,
    lineHeight: 31,
  },

  /** Setup flow question: 24/700 */
  setupQuestion: {
    fontFamily: fonts.display,
    fontSize: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.24,
    color: colors.txt1,
    lineHeight: 26,
  },

  /** Big stat / dial number: 36/700 (range 26–46, use size prop) */
  bigStat: {
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: '700' as const,
    color: colors.txt1,
    lineHeight: 36,
  },

  /** Card / wall name: 16/700, uppercase, tracking 0.03em */
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: 0.48, // 0.03em @ 16px
    textTransform: 'uppercase' as const,
    color: colors.txt1,
  },

  /** Card title large variant (walls data card): 17/700 */
  cardTitleLg: {
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: 0.51,
    textTransform: 'uppercase' as const,
    color: colors.txt1,
  },

  /** Score display large (wall cards): 30/700 */
  scoreLg: {
    fontFamily: fonts.display,
    fontSize: 30,
    fontWeight: '700' as const,
    lineHeight: 30,
  },

  /** Score display medium (wall rows): 26/700 */
  scoreMd: {
    fontFamily: fonts.display,
    fontSize: 26,
    fontWeight: '700' as const,
    lineHeight: 26,
  },

  /** Body / hint: 12/400–500, line-height 1.5 */
  bodyMd: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.txt3,
    lineHeight: 18,
  },

  /** Body small: 11/400 */
  bodySm: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '400' as const,
    color: colors.txt3,
    lineHeight: 15,
  },

  /** Label / key: 10/600, uppercase, tracking 0.16em */
  label: {
    fontFamily: fonts.display,
    fontSize: 10,
    fontWeight: '600' as const,
    letterSpacing: 1.6, // 0.16em @ 10px
    textTransform: 'uppercase' as const,
    color: colors.txt4,
  },

  /** Label small: 9/600, uppercase, tracking 0.12em */
  labelSm: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '600' as const,
    letterSpacing: 1.08,
    textTransform: 'uppercase' as const,
    color: colors.txt4,
  },

  /** Nav / top bar location: 12/600, uppercase, tracking 0.14em */
  navLabel: {
    fontFamily: fonts.display,
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1.68,
    textTransform: 'uppercase' as const,
    color: colors.txt1,
  },

  /** Nav / top bar title: 14/700, uppercase, tracking 0.12em */
  navTitle: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '700' as const,
    letterSpacing: 1.68,
    textTransform: 'uppercase' as const,
    color: colors.txt1,
  },

  /** Time-axis tick: 9/500, txt5 ONLY */
  timeTick: {
    fontFamily: fonts.display,
    fontSize: 9,
    fontWeight: '500' as const,
    color: colors.txt5,
  },

  /** Screen subtitle: Barlow 12/400 */
  screenSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400' as const,
    color: colors.txt3,
    marginTop: 5,
  },

  /** Source provenance badge: Barlow 9/600 */
  sourceBadge: {
    fontFamily: fonts.body,
    fontSize: 9,
    fontWeight: '600' as const,
    letterSpacing: 0.36,
    color: colors.txt4,
  },

  /** Calendar day number: 14/600 */
  calDay: {
    fontFamily: fonts.display,
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.txt2,
  },

  /** Calendar month heading: 17/700 */
  calMonth: {
    fontFamily: fonts.display,
    fontSize: 17,
    fontWeight: '700' as const,
    letterSpacing: 0.34,
    color: colors.txt1,
  },
} as const;

/**
 * The v2 type styles, set against `colorsV2`. Three faces with three jobs:
 * Barlow for names and controls, Barlow Condensed for the one uppercase
 * eyebrow, and IBM Plex Mono for every figure.
 */
export const typeV2 = {
  /** App name above a screen title: Barlow Condensed 12/600, uppercase, tracking 0.12em. */
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1.44,
    textTransform: 'uppercase' as const,
    color: colors.good,
  },
  /** Screen title: Barlow 30/600. */
  screenTitle: {
    fontFamily: fonts.body,
    fontSize: 30,
    fontWeight: '600' as const,
    lineHeight: 36,
    color: colorsV2.txt1,
  },
  /** Line under a title — count, freshness: Plex Mono 11/400. */
  meta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '400' as const,
    color: colorsV2.txtMuted,
  },
  /** Location name on a card: Barlow 19/600. */
  cardName: {
    fontFamily: fonts.body,
    fontSize: 19,
    fontWeight: '600' as const,
    lineHeight: 23,
    color: colorsV2.txt1,
  },
  /** Primary button label: Barlow 14/600. */
  button: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.onGood,
  },
  /** Control label — "Sort by": Barlow 13/500. */
  controlLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '500' as const,
    color: colorsV2.txtMuted,
  },
  /** Control value — "Score": Barlow 13/600. */
  controlValue: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600' as const,
    color: colorsV2.txt1,
  },
  /** Figure in a chip, and the legend's key: Plex Mono 10/500. */
  chip: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '500' as const,
    color: colorsV2.txt1,
  },
  /** A badge's label — "Score": Barlow 12/500. */
  badgeLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  /** A badge's figure — "100": Plex Mono 13/500. */
  badgeValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '500' as const,
  },
  /** A reading pill's label — "Dryness": Barlow 11/500. */
  pill: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '500' as const,
  },
  /** A reading pill's value — "Dry": Barlow 11/600. */
  pillValue: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '600' as const,
  },

  // ── Detail screen — the Overview frame ──

  /** "‹ Locations": Barlow 14/500. */
  backLink: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '500' as const,
    color: colorsV2.txtMuted,
  },
  /** A tab label: Barlow 15/600. Colour is the tab's state. */
  tab: {
    fontFamily: fonts.body,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  /** A card's uppercase kicker — "Conditions now · 13:00": Barlow Condensed 12/600, tracking 0.1em. */
  kicker: {
    fontFamily: fonts.display,
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
  /** The hero's present temperature: Plex Mono 46/500. */
  heroTemp: {
    fontFamily: fonts.mono,
    fontSize: 46,
    fontWeight: '500' as const,
    lineHeight: 52,
    color: colorsV2.txt1,
  },
  /** The hero's labelled high and low: Plex Mono 13/400. */
  heroHiLo: {
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '400' as const,
    color: colorsV2.txt2,
  },
  /** Running text on a card — the hero's weather line: Barlow 14/400. */
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '400' as const,
    color: colorsV2.txt2,
  },
  /** A gauge's label — "Dryness": Barlow 12/500. */
  gaugeLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  /** A gauge's word — "Dry": Barlow 26/600. */
  gaugeWord: {
    fontFamily: fonts.body,
    fontSize: 26,
    fontWeight: '600' as const,
    lineHeight: 31,
    color: colorsV2.txt1,
  },
  /** A gauge's figure — the score: Plex Mono 26/500. */
  gaugeFigure: {
    fontFamily: fonts.mono,
    fontSize: 26,
    fontWeight: '500' as const,
    lineHeight: 31,
  },
  /** A band's label — "Good hours": Barlow 14/500. */
  bandLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '500' as const,
    color: colorsV2.txt2,
  },
  /** A band's value — "All day": Barlow 16/600. */
  bandValue: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  /** Caveats, captions and the sources footer: Barlow 12/400, 17 leading. */
  note: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 17,
    color: colorsV2.txtMuted,
  },
  /** A disclosure control — "Measurements": Barlow 13/500. */
  disclosure: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '500' as const,
    color: colorsV2.txt2,
  },
  /** A card's title — "Today": Barlow 17/600. */
  cardTitle: {
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: '600' as const,
    color: colorsV2.txt1,
  },
  /** A card's link to a tab — "Hourly ›": Barlow 14/600, lime. */
  cardLink: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.good,
  },
  /** An hour cell's clock label: Plex Mono 11/400. */
  cellHour: {
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '400' as const,
    color: colorsV2.txtMuted,
  },
  /** An hour cell's temperature: Plex Mono 16/500. */
  cellFigure: {
    fontFamily: fonts.mono,
    fontSize: 16,
    fontWeight: '500' as const,
    color: colorsV2.txt1,
  },
  /** An hour cell's reading word: Barlow 12/500. */
  cellWord: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  /** A day row's date — "Thursday · 9/24": Barlow 14/600. */
  rowTitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '600' as const,
    color: colorsV2.txt1,
  },
  /** A day row's pill — "Score 82": Plex Mono 12/500. */
  rowPill: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  /** A Daily row's figure chip — "36% · 0.03 in", and the low: Plex Mono 12/400. */
  dayChip: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '400' as const,
    color: colorsV2.txtMuted,
  },
  /** The emphasised figure in a Daily chip — the high: Plex Mono 12/500. */
  dayChipStrong: {
    fontFamily: fonts.mono,
    fontSize: 12,
    fontWeight: '500' as const,
    color: colorsV2.txt1,
  },
  /** A fact's label — "Last rain": Barlow 14/500. */
  factLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '500' as const,
    color: colorsV2.txtMuted,
  },
  /** A fact's value — "about 41 h ago": Plex Mono 14/500. */
  factValue: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '500' as const,
    color: colorsV2.txt1,
  },
  /** A footer's heading — "Sources": Barlow 12/500. */
  footerLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500' as const,
    color: colorsV2.txtMuted,
  },

  // ── Detail screen — the Hourly frame ──

  /** A day chip — "Today", "Thu": Barlow 12/600. Colour is the chip's state. */
  dayTab: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  /** Beside a card title — "in 3 days": Barlow 13/400. */
  aside: {
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '400' as const,
    color: colorsV2.txtMuted,
  },
  /** A reading tile's label — "Dryness": Barlow 11/500. */
  tileLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '500' as const,
    color: colorsV2.txtMuted,
  },
  /** A reading tile's word — "Drying": Barlow 20/600. */
  tileWord: {
    fontFamily: fonts.body,
    fontSize: 20,
    fontWeight: '600' as const,
    color: colorsV2.txt1,
  },
  /** A reading tile's figure — the score: Plex Mono 20/500. */
  tileFigure: {
    fontFamily: fonts.mono,
    fontSize: 20,
    fontWeight: '500' as const,
    color: colorsV2.txt1,
  },
  /** A chart's name — "Temperature": Barlow 16/600. */
  chartTitle: {
    fontFamily: fonts.body,
    fontSize: 16,
    fontWeight: '600' as const,
    color: colorsV2.txt1,
  },
  /** A chart's unit beside its name — "°F": Barlow 12/400. */
  chartUnit: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '400' as const,
    color: colorsV2.txtMuted,
  },
  /** A chart's headline figure — "56–64°F": Plex Mono 14/500. */
  chartValue: {
    fontFamily: fonts.mono,
    fontSize: 14,
    fontWeight: '500' as const,
    color: colorsV2.txt1,
  },
  /** An axis tick — "06", "70°": Plex Mono 10/400. */
  axisTick: {
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '400' as const,
    color: colorsV2.txtMuted,
  },
  /** A chart legend's key — "Dew point": Barlow 12/500. */
  legend: {
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '500' as const,
    color: colorsV2.legend,
  },

  // ── Detail screen — the Precip tab ──

  /** A compact legend key — "Dry", "Snow": Barlow 11/400. */
  legendSm: {
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '400' as const,
    color: colorsV2.txtMuted,
  },
} as const;

// ─────────────────────────────────────────────
// SPACING
// ─────────────────────────────────────────────

export const spacing = {
  /** Standard horizontal screen gutter */
  screenH: 20,
  /** Top safe area / status bar clearance */
  topSafe: 48,
  /** Standard card internal padding */
  cardPad: 14,
  /** Card padding compact variant */
  cardPadSm: 12,
  /** List item vertical gap */
  listGap: 8,
  /** List item vertical gap compact */
  listGapSm: 6,
  /** Chip / tag row gap */
  chipGap: 5,
  /** Chip / tag row gap standard */
  chipGapMd: 6,
  /** Inline gap (icon + text) */
  inlineGap: 7,
  /** Section top margin */
  sectionTop: 14,
  /** Setup body top padding */
  setupBodyTop: 22,
  /** Bottom nav inset (home indicator clearance) */
  bottomInset: 24,
  /** Bottom nav height (approximate) */
  bottomNavH: 56,
  /** Micro gap — tight stack spacing (2px) */
  micro: 2,
  /** Tight gap — 4px nudges */
  tight: 4,
  /** Cell internal padding */
  cellPad: 10,
  /** Section gap — larger vertical separation */
  sectionGap: 16,
  /** v2 card-to-card gap */
  listGapLg: 12,
  /** v2 hero card padding */
  heroPad: 18,
  /** v2 gap between tab labels */
  tabGap: 20,
} as const;

// ─────────────────────────────────────────────
// BORDER RADIUS
// ─────────────────────────────────────────────

export const radius = {
  /** Standard card radius */
  card: 10,
  /** v2 card radius */
  cardV2: 16,
  /** v2 hero card radius */
  heroV2: 18,
  /** v2 row inside a card — a day row */
  rowV2: 12,
  /** Large card variant */
  cardLg: 11,
  /** Inner element radius */
  inner: 7,
  /** Chip / tile small */
  chip: 5,
  /** Chip / tile standard */
  chipMd: 8,
  /** Input / search bar */
  input: 10,
  /** Segmented control container */
  seg: 9,
  /** Segmented control item */
  segItem: 6,
  /** Step bar segment */
  stepBar: 2,
  /** Circular (aspect badge, avatar, play button) */
  full: 9999,
  /** Small tag / wtag */
  tag: 4,
  /** Source badge */
  badge: 5,
  /** Calendar day cell (range ends) */
  calRangeEnd: 8,
  /** Calendar day cell (range start) */
  calRangeStart: 8,
  /** Rail (floating layer control) */
  rail: 11,
  /** Rail button */
  railBtn: 8,
} as const;

// ─────────────────────────────────────────────
// SHADOWS / GLOWS
// No drop shadows on cards. Glow accents only.
// In RN: use shadow props + elevation for iOS/Android, or react-native-shadow-2.
// ─────────────────────────────────────────────

export const shadow = {
  /** Lime handle / active element glow */
  goodGlow: {
    shadowColor: '#b8f542',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 0,
  },
  /** Status dot glow — good */
  goodDot: {
    shadowColor: 'rgba(184,245,66,0.6)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 0,
  },
  /** Status dot glow — fair */
  fairDot: {
    shadowColor: colors.fair,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 0,
  },
  /** Status dot glow — poor */
  poorDot: {
    shadowColor: colors.poor,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 0,
  },
} as const;

// ─────────────────────────────────────────────
// COMPONENT PRESETS
// Composed from primitives above. Use these as StyleSheet bases.
// ─────────────────────────────────────────────

export const components = {
  /** Standard list/detail card */
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.cardPad,
  },

  /** Raised / active card */
  cardActive: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: spacing.cardPad,
  },

  /** Input / search bar */
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: radius.input,
    padding: 13,
  },

  /** Layer chip default */
  layerChip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.chip,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  /** Layer chip active */
  layerChipActive: {
    backgroundColor: colors.goodTint,
    borderWidth: 1,
    borderColor: colors.goodTintBorder,
    borderRadius: radius.chip,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },

  /** Primary action button (lime fill) */
  btnPrimary: {
    backgroundColor: colors.good,
    borderRadius: radius.chipMd,
    paddingVertical: 15,
    alignItems: 'center' as const,
  },

  /** Primary button text */
  btnPrimaryText: {
    ...type.navLabel,
    color: colors.onGood,
  },

  /** Wtag — dry state */
  wtagDry: {
    backgroundColor: colors.goodTint,
    borderRadius: radius.tag,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },

  /** Wtag — damp state */
  wtagDamp: {
    backgroundColor: colors.fairTint,
    borderRadius: radius.tag,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },

  /** Wtag — sun window */
  wtagSun: {
    backgroundColor: colors.sunTint,
    borderRadius: radius.tag,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },

  /** Source provenance badge */
  sourceBadge: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.badge,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },

  /** Aspect badge circle (48px) */
  aspectBadge: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.line2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },

  /** Step bar segment — inactive */
  stepBarInactive: {
    height: 3,
    borderRadius: radius.stepBar,
    backgroundColor: 'rgba(226,232,240,0.12)',
    flex: 1,
  },

  /** Step bar segment — done */
  stepBarDone: {
    height: 3,
    borderRadius: radius.stepBar,
    backgroundColor: 'rgba(184,245,66,0.50)',
    flex: 1,
  },

  /** Step bar segment — current */
  stepBarCurrent: {
    height: 3,
    borderRadius: radius.stepBar,
    backgroundColor: colors.good,
    flex: 1,
  },

  /** Chosen crag chip */
  chosenChip: {
    backgroundColor: colors.goodTint,
    borderWidth: 1,
    borderColor: colors.goodTintBorder,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingHorizontal: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 5,
  },

  /** Calendar range-start cell */
  calRangeStart: {
    backgroundColor: colors.good,
    borderTopLeftRadius: radius.calRangeStart,
    borderBottomLeftRadius: radius.calRangeStart,
  },

  /** Calendar range-end cell */
  calRangeEnd: {
    backgroundColor: colors.good,
    borderTopRightRadius: radius.calRangeEnd,
    borderBottomRightRadius: radius.calRangeEnd,
  },

  /** Calendar in-range cell */
  calInRange: {
    backgroundColor: colors.goodTintStrong,
  },
} as const;

// ─────────────────────────────────────────────
// SCREEN LAYOUT HELPERS
// ─────────────────────────────────────────────

export const layout = {
  /** Standard screen horizontal padding */
  screenPadding: {
    paddingHorizontal: spacing.screenH,
  },
  /** Standard screen top inset (below safe area) */
  screenTop: {
    paddingTop: spacing.topSafe,
  },
  /** Full-bleed screen background (use with LinearGradient) */
  screen: {
    flex: 1,
  },
  /** Content area below top bar, above bottom nav */
  body: {
    flex: 1,
    paddingHorizontal: spacing.screenH,
  },
} as const;

// ─────────────────────────────────────────────
// BOTTOM NAV
// ─────────────────────────────────────────────

export const bottomNav = {
  tabs: [
    { icon: 'home', label: 'Home', route: '/' },
    { icon: 'map-pin', label: 'Crags', route: '/crags' },
    { icon: 'calendar', label: 'Trips', route: '/trips' },
    { icon: 'radar-2', label: 'Radar', route: '/radar' },
  ],
} as const;

// ─────────────────────────────────────────────
// UNITS / LOCALE
// ─────────────────────────────────────────────

export const units = {
  temperature: '°F',
  speed: 'mph',
  precipitation: 'in',
  elevation: 'ft',
  distance: 'mi',
} as const;

// ─────────────────────────────────────────────
// CONTRAST RULES (enforced — do not override)
// ─────────────────────────────────────────────
// - Min opacity 0.50 for any label (txt4)
// - Min opacity 0.65 for body copy (use txt3 at 0.62 as floor)
// - Min opacity 0.82 for stat values (txt2)
// - Never lime (#b8f542) text on dark gradient for body copy
// - Lime reserved for: numbers, accents, primary actions
// - On lime fills: text color must be onGood (#0d1117)
