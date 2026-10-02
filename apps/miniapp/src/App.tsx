import { Suspense, lazy, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation as useRouterLocation,
  useNavigationType,
} from 'react-router-dom'
import { createQueryClient } from './lib/queryClient.js'
import { getToken, subscribeToToken } from './lib/authToken.js'
import { forgetLocations } from './lib/rememberedLocations.js'
import { forgetCards } from './lib/rememberedCards.js'
import { useAuthToken } from './hooks/useAuth.js'
import { AddLocation } from './routes/AddLocation.js'
import { Feedback } from './routes/Feedback.js'
import { LocationDetail } from './routes/LocationDetail.js'
import { EditLocation } from './routes/EditLocation.js'
import { usePreferences } from './hooks/usePreferences.js'
import { LocationList } from './routes/LocationList.js'
import { Login } from './routes/Login.js'
import { WallScreen } from './routes/WallScreen.js'
import { ClimbScreen } from './routes/ClimbScreen.js'
import { MapFallback, Profile, UnbuiltSection } from './routes/Sections.js'
import { TabBar } from './components/TabBar.js'
import { arrivalScrollY, sectionFor } from './lib/bottomNav.js'

const queryClient = createQueryClient()

/**
 * MapLibre is most of a megabyte, so the map is its own chunk, fetched the
 * first time the tab opens. A chunk that will not load (offline, or a page
 * from before a deploy asking for a file the new build no longer has) says so
 * with a reload rather than taking the app down.
 */
const MapScreen = lazy(() =>
  import('./routes/MapScreen.js').then(
    (m) => ({ default: m.MapScreen }),
    () => ({ default: () => <MapFallback failed /> }),
  ),
)

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
  if (getToken() !== null) return
  queryClient.clear()
  forgetLocations()
  forgetCards()
})

/**
 * Client-side routes only — list, detail, add, login and feedback, the
 * guidebook's wall and route screens, and the bottom bar's other four sections
 * — and no server routes: Vercel rewrites every path to `index.html`
 * (miniapp-design-v1.md §2, plus `/login` from Phase 2 of
 * `docs/handoffs/leave-telegram-v1.md`, and `/feedback`). An unrecognised path lands on the list
 * silently; the app never renders an error for a bad URL.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollMemory />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <SignedIn />
              </RequireAuth>
            }
          >
            <Route path="/" element={<LocationList />} />
            <Route path="/location/:id" element={<LocationDetail />} />
            <Route path="/location/:id/edit" element={<EditLocation />} />
            <Route path="/location/:id/wall/:wallId" element={<WallScreen />} />
            <Route path="/location/:id/wall/:wallId/route/:routeId" element={<ClimbScreen />} />
            <Route path="/add" element={<AddLocation />} />
            <Route path="/feedback" element={<Feedback />} />
            <Route path="/crags" element={<UnbuiltSection title="Crags" />} />
            <Route
              path="/map"
              element={
                <Suspense fallback={<MapFallback failed={false} />}>
                  <MapScreen />
                </Suspense>
              }
            />
            <Route path="/trips" element={<UnbuiltSection title="Trips" />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
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

/**
 * Every signed-in screen, with the bottom bar under it wherever `sectionFor`
 * places the path in a section. One bar for the whole app, so the pill slides
 * between tabs instead of being redrawn by each screen.
 */
function SignedIn() {
  const { pathname } = useRouterLocation()
  // Asked for once here, so a crag opened later finds its opening tab cached.
  usePreferences()
  const section = sectionFor(pathname)
  return (
    <>
      <Outlet />
      {section === null ? null : <TabBar active={section} />}
    </>
  )
}

/**
 * The app is one document, so every screen shares `window`'s scroll, and
 * `arrivalScrollY` decides where each one opens. Keyed on the path only: a tab
 * change inside `/location/:id` keeps its place.
 *
 * Positions are recorded as the reader scrolls, not when they leave: by the
 * time a path change is seen the next screen is already in the DOM and the old
 * position has been clamped to its height. A layout effect, so the path being
 * recorded under changes before the browser can report the clamp as a scroll.
 */
function ScrollMemory() {
  const { pathname } = useRouterLocation()
  const navigation = useNavigationType()
  const saved = useRef(new Map<string, number>())
  const current = useRef(pathname)

  useEffect(() => {
    const record = () => saved.current.set(current.current, window.scrollY)
    window.addEventListener('scroll', record, { passive: true })
    return () => window.removeEventListener('scroll', record)
  }, [])

  useLayoutEffect(() => {
    current.current = pathname
    window.scrollTo(0, arrivalScrollY(pathname, navigation, saved.current.get(pathname)))
  }, [pathname, navigation])
  return null
}
