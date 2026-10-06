import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Account, InviteCreated } from '@weatherteam6/types'
import { apiGet, apiPost } from '../lib/api.js'

/** Who is signed in, and whether they may invite (`GET /me`). */
export function useAccount(): UseQueryResult<Account> {
  return useQuery({ queryKey: ['me'], queryFn: () => apiGet<Account>('/me') })
}

export function useCreateInvite() {
  return useMutation({ mutationFn: () => apiPost<InviteCreated>('/invites', {}) })
}
