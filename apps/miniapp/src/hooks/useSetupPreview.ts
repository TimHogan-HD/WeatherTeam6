import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SetupPreview } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'
import { previewParams } from '../lib/welcome.js'
import type { SettingsDraft } from '../lib/preferencesForm.js'

/** How long a slider has to rest before the example week is asked for again. */
const SETTLE_MS = 200

const sameHours = (a: SettingsDraft, b: SettingsDraft): boolean =>
  a.lowF === b.lowF && a.highF === b.highF && a.firstHour === b.firstHour && a.lastHour === b.lastHour

/**
 * The welcome screen's example week on `draft` (`GET /setup/preview`, #543).
 *
 * **`data` is null until the answer for this very draft is in** (defect class
 * 7): while a slider moves, or its request is in flight, the screen withholds
 * the scores rather than leave the last draft's numbers under the new hours.
 * The week is deterministic, so every answer is kept for the session and a
 * draft already seen comes back at once.
 */
export function useSetupPreview(draft: SettingsDraft): {
  data: SetupPreview | null
  isError: boolean
  retry: () => void
} {
  const [asked, setAsked] = useState(draft)
  useEffect(() => {
    if (sameHours(asked, draft)) return
    const t = window.setTimeout(() => setAsked(draft), SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [draft, asked])

  const params = previewParams(asked)
  const query = useQuery({
    queryKey: ['setup-preview', params],
    queryFn: () => apiGet<SetupPreview>('/setup/preview', params),
    staleTime: Infinity,
  })
  const settled = sameHours(asked, draft)
  return {
    data: settled && query.data !== undefined ? query.data : null,
    isError: settled && query.isError,
    retry: () => void query.refetch(),
  }
}
