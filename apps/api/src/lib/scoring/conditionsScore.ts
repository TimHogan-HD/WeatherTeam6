import type { ScoreInput, ScoreOutput } from '@weatherteam6/types'

// Stub — real implementation built in Phase 5.
export function conditionsScore(_input: ScoreInput): ScoreOutput {
  return {
    score: null,
    confidence: 'low',
    window: 'pre',
    components: {
      drying_time: 0,
      upcoming_rain: 0,
      wind: 0,
      temp: 0,
      humidity: 0,
    },
    breakdown: null,
  }
}
