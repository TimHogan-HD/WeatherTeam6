import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { createQueryClient } from './lib/queryClient.js'
import { getToken, subscribeToToken } from './lib/authToken.js'
import { useAuthToken } from './hooks/useAuth.js'
import { AddLocation } from './routes/AddLocation.js'
import { LocationDetail } from './routes/LocationDetail.js'
import { LocationList } from './routes/LocationList.js'
import { Login } from './routes/Login.js'

const queryClient = createQueryClient()

/**
 * Cached responses outlive the session that fetched them. Two partners sharing
 * a household tablet: the second one signs in and sees the first one's crags on
 * the list for as long as the cache lives — with their own valid token, so
 * nothing 401s and nothing refetches.
 *
 * Subscribed here at module scope rather than in an effect inside `RequireAuth`.
 * The component that notices the token is gone is also the component being
 * unmounted by the redirect, and whether its cleanup wins that race is a
 * question about React's effect ordering rather than about this app. The store
 * outlives every screen, so this cannot be missed.
 */
subscribeToToken(() => {
  if (getToken() === null) queryClient.clear()
})

/**
 * Four client-side routes, no server routes — Vercel rewrites every path to
 * `index.html` (miniapp-design-v1.md §2, plus `/login` from Phase 2 of
 * `docs/handoffs/leave-telegram-v1.md`). An unrecognised path lands on the list
 * silently; the app never renders an error for a bad URL.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <LocationList />
              </RequireAuth>
            }
          />
          <Route
            path="/location/:id"
            element={
              <RequireAuth>
                <LocationDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/add"
            element={
              <RequireAuth>
                <AddLocation />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

/**
 * The gate. It is a client-side convenience, not a security boundary — every
 * `/api/v1` route requires the token server-side, and rendering a screen
 * without one would produce error states rather than data. What it buys is that
 * a signed-out user sees a login screen instead of three failed cards.
 *
 * **It redirects on the token, not on a 401 it observed.** `api.ts` clears the
 * token when the API rejects it, and that clear is what reaches here — so a
 * session expiring mid-screen lands on `/login` from wherever the user was,
 * with no per-screen handling.
 *
 * `replace` rather than a push: a signed-out user pressing back must not return
 * to a screen that cannot load.
 */
function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthToken()
  if (token === null) return <Navigate to="/login" replace />
  return <>{children}</>
}
