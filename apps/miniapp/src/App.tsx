import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { createQueryClient } from './lib/queryClient.js'
import { AddLocation } from './routes/AddLocation.js'
import { LocationDetail } from './routes/LocationDetail.js'
import { LocationList } from './routes/LocationList.js'
import { useTelegramChrome } from './telegram/useTelegramChrome.js'

const queryClient = createQueryClient()

/**
 * Three client-side routes, no server routes — Vercel rewrites every path to
 * `index.html` (miniapp-design-v1.md §2). An unrecognised path lands on the
 * list silently; the Mini App never renders an error for a bad URL.
 *
 * Deep-link handling (`startapp` → `/location/:id`, with `/` pushed beneath it
 * so BackButton reaches the list) belongs to Task 7 and is not wired here.
 */
export function App() {
  useTelegramChrome()

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LocationList />} />
          <Route path="/location/:id" element={<LocationDetail />} />
          <Route path="/add" element={<AddLocation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
