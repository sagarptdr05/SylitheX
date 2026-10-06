import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import { StoreProvider } from './lib/store'
import { ToastProvider } from './lib/toast'

const Landing = lazy(() => import('./pages/Landing'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const SceneAnalysis = lazy(() => import('./pages/SceneAnalysis'))
const Quality = lazy(() => import('./pages/Quality'))
const Fusion = lazy(() => import('./pages/Fusion'))
const Explain = lazy(() => import('./pages/Explain'))
const Lab = lazy(() => import('./pages/Lab'))
const Timeline = lazy(() => import('./pages/Timeline'))
const Passport = lazy(() => import('./pages/Passport'))
const Review = lazy(() => import('./pages/Review'))
const Roadmap = lazy(() => import('./pages/Roadmap'))
const Locations = lazy(() => import('./pages/Locations'))
const Models = lazy(() => import('./pages/Models'))
const Login = lazy(() => import('./pages/Login'))
const Intelligence = lazy(() => import('./pages/Intelligence'))
const Sources = lazy(() => import('./pages/Sources'))
const Anomalies = lazy(() => import('./pages/Anomalies'))
const Provenance = lazy(() => import('./pages/Provenance'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Carbon = lazy(() => import('./pages/Carbon'))
const Reports = lazy(() => import('./pages/Reports'))

const Loading = () => (
  <div className="grid min-h-[60vh] place-items-center">
    <div className="flex items-center gap-3 font-mono text-xs text-ink-3">
      <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky opacity-75" /><span className="relative h-3 w-3 rounded-full bg-sky" /></span>
      acquiring signal…
    </div>
  </div>
)

function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg px-6 text-center">
      <div>
        <div className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Signal lost · 404</div>
        <h1 className="mt-2 text-3xl font-bold text-strong">This orbit has no data</h1>
        <p className="mt-2 text-sm text-ink-2">The page you asked for does not exist.</p>
        <a href="/dashboard" className="btn-primary mt-5">Back to Overview</a>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth()
  const loc = useLocation()
  if (!ready) return <Loading />
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
    <StoreProvider>
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth><Layout /></RequireAuth>}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/scene" element={<SceneAnalysis />} />
              <Route path="/quality" element={<Quality />} />
              <Route path="/fusion" element={<Fusion />} />
              <Route path="/explain" element={<Explain />} />
              <Route path="/lab" element={<Lab />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/passport" element={<Passport />} />
              <Route path="/review" element={<Review />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/locations" element={<Locations />} />
              <Route path="/models" element={<Models />} />
              <Route path="/intelligence" element={<Intelligence />} />
              <Route path="/sources" element={<Sources />} />
              <Route path="/anomalies" element={<Anomalies />} />
              <Route path="/provenance" element={<Provenance />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/carbon" element={<Carbon />} />
              <Route path="/reports" element={<Reports />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
    </StoreProvider>
    </AuthProvider>
  )
}
