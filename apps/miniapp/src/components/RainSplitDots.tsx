import { colorsV2 } from '@weatherteam6/design/tokens'

/**
 * One dot per weather model read, filled for each that says it'll be wet
 * (`ReadingsDay.rain_split`). The Overview's Next days and the Daily rows draw
 * the same dots, so a filled dot means one thing everywhere. `label` reads the
 * count aloud; null leaves the dots decorative (a key, or beside text that
 * already says the count).
 */
export function RainSplitDots({ wet, models, label }: { wet: number; models: number; label: string | null }) {
  return (
    <span
      {...(label === null ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
      style={{ display: 'inline-flex', gap: '3px', height: '12px', alignItems: 'center' }}
    >
      {Array.from({ length: models }, (_, i) => (
        <i
          key={i}
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            border: `1.5px solid ${colorsV2.rainMark}`,
            background: i < wet ? colorsV2.rainMark : 'transparent',
            boxSizing: 'border-box',
          }}
        />
      ))}
    </span>
  )
}
