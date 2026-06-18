export function useHistoricalObservations(_locationId: string | undefined, _variable: string) {
  return { data: [] as number[], isPending: false, isError: false }
}
