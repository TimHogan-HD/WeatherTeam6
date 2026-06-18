import React from 'react'
import { TemperatureSheet } from './TemperatureSheet'
import { WindSheet } from './WindSheet'
import { HumiditySheet } from './HumiditySheet'
import { PrecipitationSheet } from './PrecipitationSheet'
import { PressureSheet } from './PressureSheet'
import { VisibilitySheet } from './VisibilitySheet'
import { UVIndexSheet } from './UVIndexSheet'
import { CloudCoverSheet } from './CloudCoverSheet'

type SheetProps = { visible: boolean; locationId: string; onDismiss: () => void }

const SHEET_MAP: Record<string, React.ComponentType<SheetProps>> = {
  temp: TemperatureSheet,
  wind: WindSheet,
  humidity: HumiditySheet,
  precip: PrecipitationSheet,
  pressure: PressureSheet,
  visibility: VisibilitySheet,
  uv: UVIndexSheet,
  cloud: CloudCoverSheet,
}

type Props = { stat: string | null; locationId: string; onDismiss: () => void }

export function DetailSheetRouter({ stat, locationId, onDismiss }: Props) {
  if (!stat) return null
  const Sheet = SHEET_MAP[stat]
  if (!Sheet) return null
  return <Sheet visible={true} locationId={locationId} onDismiss={onDismiss} />
}
