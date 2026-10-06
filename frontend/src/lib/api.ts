import { createContext, useContext, useEffect, useState } from 'react'

export const API = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const unauthorized = (r: Response) => { if (r.status === 401) window.dispatchEvent(new Event('tt:unauthorized')) }

/** Active location (AOI). Every request carries `?aoi=` so each location has its own data. */
let currentAoi = (() => { try { return localStorage.getItem('tt.aoi') ?? 'nashik' } catch { return 'nashik' } })()
export const AoiCtx = createContext(currentAoi)
export const setApiAoi = (a: string) => { currentAoi = a }
export const getApiAoi = () => currentAoi

export function withAoi(path: string, aoi = currentAoi) {
  if (/[?&]aoi=/.test(path)) return path
  return `${path}${path.includes('?') ? '&' : '?'}aoi=${encodeURIComponent(aoi)}`
}

const cache = new Map<string, unknown>()

export async function get<T>(path: string, fresh = false): Promise<T> {
  const p = withAoi(path)
  if (!fresh && cache.has(p)) return cache.get(p) as T
  const r = await fetch(API + p, { credentials: 'same-origin' })
  unauthorized(r)
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  const j = (await r.json()) as T
  cache.set(p, j)
  return j
}

export async function post<T>(path: string, body: Record<string, unknown> = {}, method = 'POST'): Promise<T> {
  const r = await fetch(API + withAoi(path), {
    method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
    body: method === 'DELETE' ? undefined : JSON.stringify({ aoi: currentAoi, ...body }),
  })
  unauthorized(r)
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return (await r.json()) as T
}

export function invalidate(prefix: string) {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
}

export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const aoi = useContext(AoiCtx)
  const full = path ? withAoi(path, aoi) : null
  const [data, setData] = useState<T | null>(full && cache.has(full) ? (cache.get(full) as T) : null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!full && !cache.has(full))
  useEffect(() => {
    if (!full) return
    let alive = true
    if (cache.has(full)) setData(cache.get(full) as T)
    else { setLoading(true); setData(null) }
    fetch(API + full, { credentials: 'same-origin' })
      .then(async (r) => { unauthorized(r); if (!r.ok) throw new Error(`${r.status} ${await r.text()}`); return r.json() })
      .then((d) => { cache.set(full, d); if (alive) { setData(d as T); setError(null) } })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full, ...deps])
  return { data, error, loading }
}

export const layerUrl = (sceneId: string, layer: string, aoi = currentAoi) => `${API}/api/scene/${sceneId}/layer/${layer}?aoi=${aoi}`
