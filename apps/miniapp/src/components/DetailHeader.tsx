import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { formatElevationFt, rockTypeLabel, type Location } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, row, stack } from '../theme/styles.js'
import { ChevronLeftIcon } from './Icons.js'
import { FeedbackButton } from './FeedbackButton.js'

/**
 * The detail screen's header band, from the WT6 Figma "V2" page's Overview
 * frame: back, the rock and elevation, the name, the coordinates and how old
 * the forecast is, then the tabs.
 *
 * It replaces `Screen`'s title row on this route only. The band is the list's
 * `surface` colour, bled to the screen edges and under the status bar exactly
 * as the list's header is, so the two screens read as one app.
 */

export type HeaderTab<T extends string> = { value: T; label: string }

/** The band's three lines, each omitted when null — while loading the band renders back alone. */
export type HeaderHeading = { eyebrow: string | null; title: string | null; meta: string | null }

export type DetailHeaderProps<T extends string> = {
  heading: HeaderHeading
  /** Where back goes, as words — `Locations`, or the tab it returns to. */
  backLabel: string
  onBack: () => void
  /** The crag the Feedback button opens a forecast check for. */
  feedbackLocationId: string | null
  tabs: {
    options: readonly HeaderTab<T>[]
    active: T
    onChange: (tab: T) => void
    panelId: string
  } | null
}

/**
 * `Sandstone · 741 ft`. **Each part omitted when absent, never dashed** — these
 * are properties of a saved row, and `unknown` is the column's default meaning
 * nobody entered one (the identity block's rule). A city carries no rock type
 * at all, whatever the column holds.
 */
export function eyebrowText(location: Location): string | null {
  const parts: string[] = []
  if (
    location.is_climbing_location &&
    location.rock_type !== null &&
    location.rock_type !== 'unknown'
  ) {
    parts.push(rockTypeLabel(location.rock_type))
  }
  if (location.elevation_m !== null) parts.push(formatElevationFt(location.elevation_m))
  return parts.length === 0 ? null : parts.join(' · ')
}

/**
 * `44.5625, −92.5338`. Four places is about 11 m, the precision a crag
 * coordinate is worth; the minus is the typographic one the Figma draws.
 */
export function coordText(lat: number, lon: number): string {
  const f = (n: number) => n.toFixed(4).replace('-', '−')
  return `${f(lat)}, ${f(lon)}`
}

/**
 * A saved location's heading. `location` is null while it loads or failed;
 * `freshness` is `forecast fetched 29 min ago`, or null when unmeasured.
 */
export function locationHeading(location: Location | null, freshness: string | null): HeaderHeading {
  if (location === null) return { eyebrow: null, title: null, meta: null }
  return {
    eyebrow: eyebrowText(location),
    title: location.name,
    meta: [coordText(location.lat, location.lon), freshness].filter((p) => p !== null).join(' · '),
  }
}

/**
 * The band. The detail screen passes `locationHeading`; the guidebook's wall
 * and route screens have a heading but no saved row of their own.
 */
export function DetailHeader<T extends string>({
  heading,
  backLabel,
  onBack,
  feedbackLocationId,
  tabs,
}: DetailHeaderProps<T>) {
  const { eyebrow, title, meta } = heading

  return (
    <header
      style={{
        ...stack(spacing.tight),
        backgroundColor: colorsV2.surface,
        marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
        paddingTop: `calc(env(safe-area-inset-top, 0px) + ${spacing.topSafe}px)`,
        paddingInline: `${spacing.screenH}px`,
        ...(tabs === null ? { paddingBottom: `${spacing.sectionGap}px` } : {}),
      }}
    >
      {/*
        The tap target reaches past the glyph with padding and pulls back with
        a negative margin, so the chevron sits on the gutter while the target
        clears 44px — `Screen`'s back control, restyled.
      */}
      <div style={{ ...row(spacing.cellPad), justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            ...bareButton,
            ...row(spacing.tight),
            width: 'auto',
            margin: `-${spacing.cellPad}px 0 -${spacing.cellPad}px -${spacing.cellPad}px`,
            padding: `${spacing.cellPad}px`,
          }}
        >
          <ChevronLeftIcon color={colorsV2.txtMuted} />
          <span style={typeV2.backLink}>{backLabel}</span>
        </button>
        <FeedbackButton locationId={feedbackLocationId} />
      </div>

      {eyebrow === null ? null : <p style={{ ...typeV2.eyebrow, marginTop: `${spacing.listGap}px` }}>{eyebrow}</p>}
      {title === null ? null : <h1 style={typeV2.screenTitle}>{title}</h1>}
      {meta === null || meta === '' ? null : <p style={typeV2.meta}>{meta}</p>}

      {tabs === null ? null : (
        <div
          role="tablist"
          aria-label="Location detail"
          style={{
            ...row(spacing.tabGap),
            paddingTop: `${spacing.cardPad}px`,
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {tabs.options.map((option) => {
            const selected = option.value === tabs.active
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={selected}
                {...(selected ? { 'aria-controls': tabs.panelId } : {})}
                onClick={() => tabs.onChange(option.value)}
                style={{
                  ...bareButton,
                  ...stack(spacing.cellPad),
                  width: 'auto',
                  flexShrink: 0,
                  alignItems: 'center',
                }}
              >
                <span style={{ ...typeV2.tab, color: selected ? colorsV2.txt1 : colorsV2.txtTab }}>
                  {option.label}
                </span>
                <span
                  aria-hidden
                  style={{
                    alignSelf: 'stretch',
                    height: '3px',
                    borderRadius: `${radius.stepBar}px`,
                    backgroundColor: selected ? colors.good : 'transparent',
                  }}
                />
              </button>
            )
          })}
        </div>
      )}
    </header>
  )
}
