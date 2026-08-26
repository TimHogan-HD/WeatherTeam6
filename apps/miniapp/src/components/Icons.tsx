import { IconDroplet, IconMapPin, IconTemperature, IconWind } from '@tabler/icons-react'
import { colors } from '@weatherteam6/design/tokens'

/**
 * The four icons §8 budgets for, from `@tabler/icons-react` — the web sibling
 * of the RN package §Design System names, with the same icon names.
 *
 * **Not `chevron-left`.** Back is Telegram's `BackButton` and a second back
 * affordance is a bug (§2). The alert treatment uses a coloured bar and the
 * event name rather than `alert-triangle`, which is outside the mockup's 1:1
 * icon map.
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
