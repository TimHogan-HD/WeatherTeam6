/**
 * WeatherTeam6 — Design Tokens
 * Extracted from: design_handoff_crux_conditions (radar.css, walls.css, trips.css, README)
 * Canonical source: .crux-phone CSS custom properties block in radar.css
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

export const uvScale = [
  '#4ade80', '#86efac', '#fde047', '#fbbf24', '#fb923c',
  '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#7c3aed', '#6d28d9',
] as const

// ─────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────
// Load via expo-font: 'BarlowCondensed-*' and 'Barlow-*'
// Google Fonts: Barlow Condensed (400/500/600/700), Barlow (400/500/600)

export const fonts = {
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
} as const;

// ─────────────────────────────────────────────
// BORDER RADIUS
// ─────────────────────────────────────────────

export const radius = {
  /** Standard card radius */
  card: 10,
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
