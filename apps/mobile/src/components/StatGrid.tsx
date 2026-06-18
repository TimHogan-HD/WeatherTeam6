import { StyleSheet, View } from 'react-native'
import { spacing } from '@weatherteam6/design/tokens'
import type { WeatherObservation } from '../types/weather'
import { StatTile } from './StatTile'

type HomeProps = {
  variant: 'home'
  obs: WeatherObservation
  onTilePress?: (stat: string) => void
  onTileLongPress?: (stat: string) => void
}

type DetailProps = {
  variant: 'detail'
  obs: WeatherObservation
  daylightHours?: number
  onTilePress?: (stat: string) => void
  onTileLongPress?: (stat: string) => void
}

type Props = HomeProps | DetailProps

function fmtWind(obs: WeatherObservation) {
  return `${obs.windSpeedMph} mph`
}

function windDetail(obs: WeatherObservation) {
  return `${obs.windDirectionLabel}  Gusts ${obs.windGustMph}`
}

function windBarPct(obs: WeatherObservation) {
  return Math.min(1, obs.windSpeedMph / 40)
}

function humidityBarPct(obs: WeatherObservation) {
  return obs.humidityPct / 100
}

function pressureBarPct(obs: WeatherObservation) {
  return Math.min(1, Math.max(0, (obs.pressureInHg - 28.5) / (31 - 28.5)))
}

export function StatGrid(props: Props) {
  const { obs, onTilePress, onTileLongPress } = props

  if (props.variant === 'home') {
    return (
      <View style={styles.grid}>
        <View style={styles.row}>
          <StatTile
            label="Wind"
            value={fmtWind(obs)}
            detail={windDetail(obs)}
            showBar
            barPct={windBarPct(obs)}
            onPress={() => onTilePress?.('wind')}
            onLongPress={() => onTileLongPress?.('wind')}
          />
          <StatTile
            label="Humidity"
            value={`${obs.humidityPct}%`}
            detail={`Dew pt ${obs.dewPointF}°F`}
            showBar
            barPct={humidityBarPct(obs)}
            onPress={() => onTilePress?.('humidity')}
            onLongPress={() => onTileLongPress?.('humidity')}
          />
          <StatTile
            label="Pressure"
            value={`${obs.pressureInHg.toFixed(2)}`}
            detail={`inHg  ${obs.pressureTrend}`}
            showBar
            barPct={pressureBarPct(obs)}
            onPress={() => onTilePress?.('pressure')}
            onLongPress={() => onTileLongPress?.('pressure')}
          />
        </View>
        <View style={styles.row}>
          <StatTile label="Visibility" value={`${obs.visibilityMiles} mi`} onPress={() => onTilePress?.('visibility')} onLongPress={() => onTileLongPress?.('visibility')} />
          <StatTile label="UV Index" value={`${obs.uvIndex}`} detail="Moderate" onPress={() => onTilePress?.('uv')} onLongPress={() => onTileLongPress?.('uv')} />
          <StatTile label="Cloud Cover" value={`${obs.cloudCoverPct}%`} onPress={() => onTilePress?.('cloud')} onLongPress={() => onTileLongPress?.('cloud')} />
          <StatTile label="Precip 1H" value={`${obs.precip1hIn.toFixed(2)}"`} onPress={() => onTilePress?.('precip')} onLongPress={() => onTileLongPress?.('precip')} />
        </View>
      </View>
    )
  }

  const dh = props.variant === 'detail' ? props.daylightHours : undefined
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <StatTile label="Wind" value={fmtWind(obs)} detail={windDetail(obs)} showBar barPct={windBarPct(obs)} onPress={() => onTilePress?.('wind')} onLongPress={() => onTileLongPress?.('wind')} />
        <StatTile label="Humidity" value={`${obs.humidityPct}%`} detail={`Dew pt ${obs.dewPointF}°F`} showBar barPct={humidityBarPct(obs)} onPress={() => onTilePress?.('humidity')} onLongPress={() => onTileLongPress?.('humidity')} />
        <StatTile label="Pressure" value={`${obs.pressureInHg.toFixed(2)}`} detail={`inHg  ${obs.pressureTrend}`} showBar barPct={pressureBarPct(obs)} onPress={() => onTilePress?.('pressure')} onLongPress={() => onTileLongPress?.('pressure')} />
        <StatTile label="Visibility" value={`${obs.visibilityMiles} mi`} onPress={() => onTilePress?.('visibility')} onLongPress={() => onTileLongPress?.('visibility')} />
      </View>
      <View style={styles.row}>
        <StatTile label="UV Index" value={`${obs.uvIndex}`} detail="Moderate" onPress={() => onTilePress?.('uv')} onLongPress={() => onTileLongPress?.('uv')} />
        <StatTile label="Cloud Cover" value={`${obs.cloudCoverPct}%`} onPress={() => onTilePress?.('cloud')} onLongPress={() => onTileLongPress?.('cloud')} />
        <StatTile label="Precip 1H" value={`${obs.precip1hIn.toFixed(2)}"`} onPress={() => onTilePress?.('precip')} onLongPress={() => onTileLongPress?.('precip')} />
        <StatTile label="Daylight" value={dh !== undefined ? `${dh.toFixed(1)}h` : '—'} onLongPress={() => onTileLongPress?.('daylight')} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: spacing.screenH,
    gap: spacing.listGapSm,
    marginBottom: spacing.sectionTop,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.listGapSm,
  },
})
