import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { API, invalidate } from './api'

export interface User { id: number; email: string; name: string; org?: string; api_key: string; role: string; created_at?: string }
interface Ctx {
  user: User | null; ready: boolean
  login: (email: string, password: string) => Promise<void>
  register: (b: { email: string; password: string; name: string; org?: string }) => Promise<void>
  demo: () => Promise<void>; logout: () => Promise<void>; setUser: (u: User | null) => void
}
const C = createContext<Ctx | null>(null)

async function call(path: string, body?: unknown) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : Array.isArray(j.detail) ? j.detail.map((d: { msg: string }) => d.msg).join(', ') : `Error ${r.status}`)
  return j
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    fetch(API + '/api/auth/me', { credentials: 'same-origin' }).then((r) => r.json()).then((u) => setUser(u)).catch(() => setUser(null)).finally(() => setReady(true))
    const off = () => setUser(null)
    window.addEventListener('tt:unauthorized', off)
    return () => window.removeEventListener('tt:unauthorized', off)
  }, [])
  const done = useCallback((u: User) => { invalidate(''); setUser(u) }, [])
  const login = async (email: string, password: string) => done(await call('/api/auth/login', { email, password }))
  const register = async (b: { email: string; password: string; name: string; org?: string }) => done(await call('/api/auth/register', b))
  const demo = async () => done(await call('/api/auth/demo'))
  const logout = async () => { await call('/api/auth/logout').catch(() => undefined); invalidate(''); setUser(null) }
  return <C.Provider value={{ user, ready, login, register, demo, logout, setUser }}>{children}</C.Provider>
}

export function useAuth() {
  const c = useContext(C)
  if (!c) throw new Error('AuthProvider missing')
  return c
}
