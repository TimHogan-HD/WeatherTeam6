import {
  IconChevronDown,
  IconChevronLeft,
  IconDroplet,
  IconMapPin,
  IconTemperature,
  IconWind,
} from '@tabler/icons-react'
import { colors } from '@weatherteam6/design/tokens'

/**
 * The icons §8 budgets for, from `@tabler/icons-react` — the web sibling of the
 * RN package §Design System names, with the same icon names.
 *
 * **`chevron-left` is here as of Phase 2 of `leave-telegram-v1.md`**, which
 * reverses §8's "not chevron-left" and §2's "no in-app back arrow". Those rules
 * said back is Telegram's `BackButton` and a second affordance is a bug; in an
 * ordinary browser there is no first affordance, so this is the only one. The
 * per-route back *targets* in §2 are unchanged — see `lib/backTarget.ts`.
 *
 * The alert treatment still uses a coloured bar and the event name rather than
 * `alert-triangle`, which is outside the mockup's 1:1 icon map.
 *
 * Size and colour are fixed here rather than at each call site: the icons sit
 * against `type.label`, so they take the same `txt4` weight the labels do, and
 * a one-off colour would be a redefinition of a token.
 */

const SIZE = 13

type IconProps = { color?: string }

function props(color: string | undefined) {
  return { size: SIZE, stroke: 1.75, color: color ?? colors.txt4, 'aria-hidden': true }
}

export const MapPinIcon = ({ color }: IconProps) => <IconMapPin {...props(color)} />
export const TemperatureIcon = ({ color }: IconProps) => <IconTemperature {...props(color)} />
export const WindIcon = ({ color }: IconProps) => <IconWind {...props(color)} />
export const DropletIcon = ({ color }: IconProps) => <IconDroplet {...props(color)} />

/**
 * Larger than the other four, and the exception is deliberate: those sit
 * inline against `type.label` text, where matching the label's size is the
 * point. This one is a navigation control. At 13px it reads as a stray mark
 * next to its own word, and the tap target is the button's padding, not the
 * glyph.
 */
export const ChevronLeftIcon = ({ color }: IconProps) => (
  <IconChevronLeft {...props(color)} size={18} />
)

/**
 * The measurements disclosure's affordance. Label-sized, like the first four,
 * because it sits beside a `type.label` word rather than standing alone.
 *
 * **Turned rather than swapped for a second icon**, and the turn is not motion:
 * there is no CSS or motion architecture to animate it with, and none is
 * authorised. It is two static states of one glyph, so an open panel and a
 * closed one cannot come to use two icons that disagree about which is which.
 */
export const ChevronDownIcon = ({ color, open }: IconProps & { open: boolean }) => (
  <IconChevronDown
    {...props(color)}
    style={open ? { transform: 'rotate(180deg)' } : {}}
  />
)
