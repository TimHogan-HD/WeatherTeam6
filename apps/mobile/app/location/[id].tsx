import { Stack, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  ConditionsScore,
  ForecastSnapshot,
  ScoreBreakdown,
} from '@weatherteam6/types';
import { SCORE_COMPONENT_MAX } from '@weatherteam6/types';
import { useConditions } from '../../src/hooks/useConditions';
import { useForecast } from '../../src/hooks/useForecast';
import { useLocations } from '../../src/hooks/useLocations';

const WINDOW_LABEL: Record<NonNullable<ForecastSnapshot['window']>, string> = {
  pre: 'Pre',
  early: 'Early',
  decision: 'Decision',
};

function ComponentBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={styles.barValue}>
        {value}/{max}
      </Text>
    </View>
  );
}

function Breakdown({ breakdown }: { breakdown: ScoreBreakdown }) {
  return (
    <View style={styles.breakdown}>
      <ComponentBar label="Drying" value={breakdown.drying.score} max={SCORE_COMPONENT_MAX.drying} />
      <ComponentBar label="Rain" value={breakdown.rain.score} max={SCORE_COMPONENT_MAX.rain} />
      <ComponentBar label="Wind" value={breakdown.wind.score} max={SCORE_COMPONENT_MAX.wind} />
      <ComponentBar label="Temp" value={breakdown.temp.score} max={SCORE_COMPONENT_MAX.temp} />
      <ComponentBar
        label="Humidity"
        value={breakdown.humidity.score}
        max={SCORE_COMPONENT_MAX.humidity}
      />
    </View>
  );
}

function ConditionsSection({
  conditions,
}: {
  conditions: ConditionsScore | null | undefined;
}) {
  if (!conditions) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conditions</Text>
        <Text style={styles.muted}>No score computed yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Conditions</Text>
      <View style={styles.scoreRow}>
        <Text style={styles.scoreValue}>{conditions.score ?? '—'}</Text>
        <Text style={styles.confidence}>{conditions.confidence} confidence</Text>
      </View>
      {conditions.score_breakdown ? (
        <Breakdown breakdown={conditions.score_breakdown} />
      ) : null}
    </View>
  );
}

function fmtMm(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}mm`;
}

function fmtTemp(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}°`;
}

function ForecastRow({ snapshot }: { snapshot: ForecastSnapshot }) {
  return (
    <View style={styles.forecastRow}>
      <View style={styles.forecastDateCol}>
        <Text style={styles.forecastDate}>{snapshot.forecast_date}</Text>
        {snapshot.window ? (
          <Text style={styles.windowBadge}>{WINDOW_LABEL[snapshot.window]}</Text>
        ) : null}
      </View>
      <View style={styles.forecastMetrics}>
        <Text style={styles.metric}>
          Rain {fmtMm(snapshot.precip_mm_p50)} ({fmtMm(snapshot.precip_mm_p10)}–
          {fmtMm(snapshot.precip_mm_p90)})
        </Text>
        <Text style={styles.metric}>
          Temp {fmtTemp(snapshot.temp_c_min)}/{fmtTemp(snapshot.temp_c_max)} · Wind{' '}
          {snapshot.wind_kmh_max === null
            ? '—'
            : `${Math.round(snapshot.wind_kmh_max)}km/h`}
        </Text>
      </View>
    </View>
  );
}

export default function LocationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: locations } = useLocations();
  const conditions = useConditions(id);
  const forecast = useForecast(id);

  if (!id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Location not found.</Text>
      </View>
    );
  }

  const location = locations?.find((loc) => loc.id === id);
  const title = location?.name ?? 'Location';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title }} />

      {conditions.isPending ? (
        <ActivityIndicator style={styles.loader} />
      ) : conditions.isError ? (
        <Text style={styles.errorText}>{conditions.error.message}</Text>
      ) : (
        <ConditionsSection conditions={conditions.data} />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Forecast</Text>
        {forecast.isPending ? (
          <ActivityIndicator style={styles.loader} />
        ) : forecast.isError ? (
          <Text style={styles.errorText}>{forecast.error.message}</Text>
        ) : !forecast.data || forecast.data.length === 0 ? (
          <Text style={styles.muted}>No forecast available.</Text>
        ) : (
          forecast.data.map((snapshot) => (
            <ForecastRow key={snapshot.forecast_date} snapshot={snapshot} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loader: {
    marginVertical: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 12,
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: '700',
  },
  confidence: {
    fontSize: 14,
    opacity: 0.6,
    textTransform: 'capitalize',
  },
  breakdown: {
    gap: 8,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barLabel: {
    width: 70,
    fontSize: 13,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e4e4e7',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563eb',
  },
  barValue: {
    width: 48,
    fontSize: 12,
    textAlign: 'right',
    opacity: 0.6,
  },
  forecastRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e4e4e7',
  },
  forecastDateCol: {
    width: 96,
  },
  forecastDate: {
    fontSize: 14,
    fontWeight: '500',
  },
  windowBadge: {
    fontSize: 11,
    marginTop: 4,
    opacity: 0.5,
  },
  forecastMetrics: {
    flex: 1,
    gap: 4,
  },
  metric: {
    fontSize: 13,
  },
  muted: {
    opacity: 0.6,
  },
  errorText: {
    color: '#b91c1c',
    marginVertical: 8,
  },
});
