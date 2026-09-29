import {
  IconBulb,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCloudRain,
  IconDroplet,
  IconHelpCircle,
  IconPlus,
  IconRipple,
  IconSun,
  IconTemperature,
  IconWind,
  IconX,
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

export const TemperatureIcon = ({ color }: IconProps) => <IconTemperature {...props(color)} />
export const WindIcon = ({ color }: IconProps) => <IconWind {...props(color)} />
export const DropletIcon = ({ color }: IconProps) => <IconDroplet {...props(color)} />

/**
 * Humidity, in v2. v2 gives rain the droplet and humidity its own glyph, where
 * the first design used the droplet for humidity and had no rain figure on the
 * card. Same package, same size and stroke as the three above.
 */
export const HumidityIcon = ({ color }: IconProps) => <IconRipple {...props(color)} />

/** The list's Add button, in v2. */
export const PlusIcon = ({ color }: IconProps) => <IconPlus {...props(color)} size={16} stroke={2.25} />

/** The card's "opens" affordance in v2. Decorative — the whole card is the target. */
export const ChevronRightIcon = ({ color }: IconProps) => (
  <IconChevronRight {...props(color)} size={20} />
)

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

/** The Precip tab's caveat, from the Figma frame's `circle-help`. 14px, the frame's size. */
export const HelpIcon = ({ color }: IconProps) => <IconHelpCircle {...props(color)} size={14} />

/** The Rock tab's section glyphs: rain, sun, the fun fact, and the do/don't marks. 16px — they head a line rather than sit inside one. */
export const RainIcon = ({ color }: IconProps) => <IconCloudRain {...props(color)} size={16} />
export const SunIcon = ({ color }: IconProps) => <IconSun {...props(color)} size={16} />
export const BulbIcon = ({ color }: IconProps) => <IconBulb {...props(color)} size={16} />
export const CheckIcon = ({ color }: IconProps) => <IconCheck {...props(color)} size={14} stroke={2.25} />
export const CrossIcon = ({ color }: IconProps) => <IconX {...props(color)} size={14} stroke={2.25} />
