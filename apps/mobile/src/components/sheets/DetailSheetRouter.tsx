import { TemperatureSheet } from './TemperatureSheet'
import { WindSheet } from './WindSheet'
import { HumiditySheet } from './HumiditySheet'
import { PrecipitationSheet } from './PrecipitationSheet'
import { PressureSheet } from './PressureSheet'
import { VisibilitySheet } from './VisibilitySheet'
import { UVIndexSheet } from './UVIndexSheet'
import { CloudCoverSheet } from './CloudCoverSheet'

type Props = {
  stat: string | null
  locationId: string
  onDismiss: () => void
}

export function DetailSheetRouter({ stat, locationId, onDismiss }: Props) {
  if (!stat) return null

  return (
    <>
      <TemperatureSheet
        visible={stat === 'temp'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
      <WindSheet
        visible={stat === 'wind'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
      <HumiditySheet
        visible={stat === 'humidity'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
      <PrecipitationSheet
        visible={stat === 'precip'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
      <PressureSheet
        visible={stat === 'pressure'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
      <VisibilitySheet
        visible={stat === 'visibility'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
      <UVIndexSheet
        visible={stat === 'uv'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
      <CloudCoverSheet
        visible={stat === 'cloud'}
        locationId={locationId}
        onDismiss={onDismiss}
      />
    </>
  )
}
