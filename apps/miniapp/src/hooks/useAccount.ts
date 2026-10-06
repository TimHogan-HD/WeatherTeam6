import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Account, InviteCreated, InviteSummary } from '@weatherteam6/types'
import { apiDelete, apiGet, apiPost } from '../lib/api.js'

const invitesKey = ['invites'] as const

/** Who is signed in, and whether they may invite (`GET /me`). */
export function useAccount(): UseQueryResult<Account> {
  return useQuery({ queryKey: ['me'], queryFn: () => apiGet<Account>('/me') })
}

/** The owner's links and who joined through each. Mount it for the owner only: anyone else gets a 403. */
export function useInvites(): UseQueryResult<InviteSummary[]> {
  return useQuery({ queryKey: invitesKey, queryFn: () => apiGet<InviteSummary[]>('/invites') })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<InviteCreated>('/invites', {}),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: invitesKey }),
  })
}

export function useCancelInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/invites/${encodeURIComponent(id)}`),
    // Returned, so the row stays "Cancelling…" until the refetch drops it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey }),
  })
}
