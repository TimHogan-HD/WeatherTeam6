import { useForecast } from './useForecast'

export function usePrecipEnsemble(locationId: string | undefined) {
  const { data, isPending, isError } = useForecast(locationId)
  return { data: data ?? [], isPending, isError }
}
