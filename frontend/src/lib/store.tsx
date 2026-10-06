import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AoiCtx, get, invalidate, setApiAoi, useApi } from './api'
import { useAuth } from './auth'
import type { Aoi, Profile, ProfileId, Scene, SceneListItem } from './types'

interface Ctx {
  aoi: string; setAoi: (a: string) => void; aois: Aoi[]; activeAoi: Aoi | null; refreshAois: () => void
  sceneId: string; setSceneId: (s: string) => void
  profile: ProfileId; setProfile: (p: ProfileId) => void
  scenes: SceneListItem[]; profiles: Profile[]
  scene: Scene | null; sceneLoading: boolean; apiError: string | null
}
const C = createContext<Ctx | null>(null)

const read = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* ignore */ } }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [aoi, setAoiS] = useState(() => read('tt.aoi', 'nashik'))
  const [aois, setAois] = useState<Aoi[]>([])
  const [sceneId, setSceneIdS] = useState(() => read('tt.scene', 'DEMO-HEALTHY'))
  const [profile, setProfileS] = useState<ProfileId>(() => read('tt.profile', 'crop_monitoring') as ProfileId)
  const { user } = useAuth()
  const activeAoi = aois.find((a) => a.id === aoi) ?? null
  const ready = !!user && (!activeAoi || activeAoi.status.state === 'ready')
  const scenesQ = useApi<SceneListItem[]>(ready ? `/api/scenes?aoi=${aoi}` : `/api/scenes?aoi=${['nashik', 'vasai-virar'].includes(aoi) ? aoi : 'nashik'}`, [user?.id])
  const profilesQ = useApi<Profile[]>('/api/profiles?aoi=nashik')
  const sceneQ = useApi<Scene>(ready ? `/api/scene/${sceneId}?aoi=${aoi}` : null, [user?.id])

  const refreshAois = useCallback(() => {
    invalidate('/api/aois')
    get<Aoi[]>('/api/aois', true).then(setAois).catch(() => undefined)
  }, [])
  useEffect(() => { refreshAois() }, [refreshAois, user?.id])
  useEffect(() => { // poll while any location is being built
    if (!aois.some((a) => ['building', 'queued'].includes(a.status.state))) return
    const t = setInterval(refreshAois, 2500)
    return () => clearInterval(t)
  }, [aois, refreshAois])
  useEffect(() => { if (aois.length && !aois.find((a) => a.id === aoi)) setAoi('nashik') }, [aois, aoi]) // eslint-disable-line

  const setAoi = (a: string) => {
    setApiAoi(a); write('tt.aoi', a); setAoiS(a)
    setSceneIdS('DEMO-HEALTHY'); write('tt.scene', 'DEMO-HEALTHY')
  }
  const setSceneId = (s: string) => { setSceneIdS(s); write('tt.scene', s) }
  const setProfile = (p: ProfileId) => { setProfileS(p); write('tt.profile', p) }
  useEffect(() => {
    if (scenesQ.data && scenesQ.data.length && !scenesQ.data.find((s) => s.scene_id === sceneId)) setSceneId('DEMO-HEALTHY')
  }, [scenesQ.data, sceneId])
  const scene = useMemo(() => {
    if (!sceneQ.data || sceneQ.data.aoi && sceneQ.data.aoi !== aoi) return null
    return { ...sceneQ.data, profile, ai_readiness: sceneQ.data.ai_readiness_all[profile] }
  }, [sceneQ.data, profile, aoi])
  return (
    <C.Provider value={{ aoi, setAoi, aois, activeAoi, refreshAois, sceneId, setSceneId, profile, setProfile,
      scenes: scenesQ.data ?? [], profiles: profilesQ.data ?? [], scene, sceneLoading: sceneQ.loading, apiError: scenesQ.error }}>
      <AoiCtx.Provider value={aoi}>{children}</AoiCtx.Provider>
    </C.Provider>
  )
}

export function useStore() {
  const c = useContext(C)
  if (!c) throw new Error('StoreProvider missing')
  return c
}
