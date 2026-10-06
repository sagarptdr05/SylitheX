import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export interface GlobeAoi { id: string; name: string; lat: number; lon: number; trust?: number | null }

const trustHex = (t?: number | null) => (t == null ? 0x7dd3fc : t >= 80 ? 0x34d399 : t >= 50 ? 0xfbbf24 : 0xf85960)

function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')) } catch { return false }
}

function latLon(lat: number, lon: number, r = 1) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
}

function labelSprite(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 96
  const g = c.getContext('2d')!
  g.font = '600 40px JetBrains Mono, monospace'
  const w = g.measureText(text).width + 44
  g.fillStyle = 'rgba(6,19,37,0.78)'
  g.strokeStyle = color
  g.lineWidth = 3
  g.beginPath(); g.roundRect(4, 14, w, 66, 14); g.fill(); g.stroke()
  g.fillStyle = color
  g.beginPath(); g.arc(28, 47, 8, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#E2F3FF'
  g.fillText(text, 46, 61)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.scale.set(0.62, 0.116, 1)
  s.center.set(0, 0.5)
  return s
}

function satellite(kind: 'sar' | 'optical') {
  const g = new THREE.Group()
  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a94a, metalness: 0.85, roughness: 0.3, emissive: 0x2a1a00 })
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eef2, metalness: 0.4, roughness: 0.5 })
  const panel = new THREE.MeshStandardMaterial({ color: 0x1b3a8a, metalness: 0.6, roughness: 0.25, emissive: 0x0b2a6b, emissiveIntensity: 0.6 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), kind === 'sar' ? white : gold)
  g.add(body)
  const wing = new THREE.BoxGeometry(0.16, 0.003, 0.05)
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wing, panel)
    w.position.x = s * 0.11
    g.add(w)
  }
  if (kind === 'sar') {
    const ant = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.035), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7, roughness: 0.35 }))
    ant.position.set(0, -0.045, 0.045)
    g.add(ant)
  } else {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.03, 16), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1, emissive: 0x0ea5e9, emissiveIntensity: 0.4 }))
    lens.position.set(0, -0.035, 0)
    g.add(lens)
  }
  return g
}

interface Props { onPass?: (sat: string | null) => void; onSelect?: (id: string) => void; className?: string; aois?: GlobeAoi[]; active?: string }

export default function Globe({ onPass, onSelect, className, aois = [], active }: Props) {
  const [gl] = useState(hasWebGL)
  const selRef = useRef(onSelect)
  selRef.current = onSelect
  const AOI = aois.find((a) => a.id === active) ?? aois[0] ?? { id: 'nashik', name: 'Nashik', lat: 20.08, lon: 74.03 }
  const others = aois.filter((a) => a.id !== AOI.id)
  const key = `${AOI.id}|${aois.map((o) => `${o.id}:${o.trust?.toFixed(0)}`).join(',')}`
  const ref = useRef<HTMLDivElement>(null)
  const passRef = useRef(onPass)
  passRef.current = onPass

  useEffect(() => {
    if (!gl) return
    const el = ref.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100)
    camera.position.set(0, 0.15, 4.4)

    // stars
    const starGeo = new THREE.BufferGeometry()
    const pts: number[] = []
    for (let i = 0; i < 1400; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 20)
      pts.push(v.x, v.y, v.z)
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.06, transparent: true, opacity: 0.8 }))
    scene.add(stars)

    // earth
    const loader = new THREE.TextureLoader()
    const tex = loader.load('/textures/earth-blue-marble.jpg')
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const bump = loader.load('/textures/earth-topology.png')
    const spec = loader.load('/textures/earth-water.png')
    const earth = new THREE.Group()
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.MeshPhongMaterial({ map: tex, bumpMap: bump, bumpScale: 0.03, specularMap: spec, specular: new THREE.Color(0x335577), shininess: 18 }),
    )
    earth.add(globe)

    // lat/long graticule (thin, futuristic)
    const gratMat = new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.12 })
    for (let lat = -60; lat <= 60; lat += 30) {
      const p: THREE.Vector3[] = []
      for (let lon = -180; lon <= 180; lon += 4) p.push(latLon(lat, lon, 1.004))
      earth.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), gratMat))
    }
    for (let lon = -180; lon < 180; lon += 30) {
      const p: THREE.Vector3[] = []
      for (let lat = -90; lat <= 90; lat += 4) p.push(latLon(lat, lon, 1.004))
      earth.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(p), gratMat))
    }

    // AOI marker (Nashik)
    const aoiPos = latLon(AOI.lat, AOI.lon, 1.003)
    const aoiN = aoiPos.clone().normalize()
    const aCol = trustHex(AOI.trust)
    const pickables: { obj: THREE.Object3D; id: string }[] = []
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), new THREE.MeshBasicMaterial({ color: aCol }))
    pickables.push({ obj: dot, id: AOI.id })
    dot.position.copy(aoiPos)
    earth.add(dot)
    const ringGeo = new THREE.RingGeometry(0.02, 0.026, 48)
    const rings: THREE.Mesh[] = []
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: aCol, transparent: true, opacity: 0.8, side: THREE.DoubleSide }))
      ring.position.copy(aoiPos)
      ring.lookAt(aoiPos.clone().multiplyScalar(2))
      earth.add(ring)
      rings.push(ring)
    }
    const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 8), new THREE.MeshBasicMaterial({ color: aCol, transparent: true, opacity: 0.7 }))
    spike.position.copy(aoiN.clone().multiplyScalar(1.11))
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aoiN)
    earth.add(spike)
    // AOI box footprint
    const box = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([
      latLon(AOI.lat - 1.6, AOI.lon - 1.6, 1.005), latLon(AOI.lat - 1.6, AOI.lon + 1.6, 1.005),
      latLon(AOI.lat + 1.6, AOI.lon + 1.6, 1.005), latLon(AOI.lat + 1.6, AOI.lon - 1.6, 1.005),
    ]), new THREE.LineBasicMaterial({ color: aCol, transparent: true, opacity: 0.8 }))
    earth.add(box)
    // other monitored locations
    for (const o of others) {
      const p = latLon(o.lat, o.lon, 1.004)
      const oc = trustHex(o.trust)
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 12), new THREE.MeshBasicMaterial({ color: oc }))
      m.position.copy(p)
      earth.add(m)
      // invisible larger hit target so small markers are easy to click / tap
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), new THREE.MeshBasicMaterial({ visible: false }))
      hit.position.copy(p); earth.add(hit)
      pickables.push({ obj: hit, id: o.id })
      const r = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.023, 32), new THREE.MeshBasicMaterial({ color: oc, transparent: true, opacity: 0.7, side: THREE.DoubleSide }))
      r.position.copy(p); r.lookAt(p.clone().multiplyScalar(2))
      earth.add(r)
    }

    // atmosphere (fresnel glow)
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.12, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vN; void main(){ float i = pow(0.72 - dot(vN, vec3(0,0,1.0)), 3.2); gl_FragColor = vec4(0.35,0.78,1.0,1.0)*i; }',
        blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true,
      }),
    )
    scene.add(atmo)

    // orient: AOI faces camera, tilted to its latitude
    const p0 = latLon(0, AOI.lon)
    const baseYaw = Math.atan2(-p0.x, p0.z)
    earth.rotation.order = 'XYZ'
    earth.rotation.x = (AOI.lat * Math.PI) / 180 * 0.85
    earth.rotation.y = baseYaw
    scene.add(earth)

    // lights
    scene.add(new THREE.AmbientLight(0x9fb7d0, 0.65))
    const sun = new THREE.DirectionalLight(0xffffff, 2.4)
    sun.position.set(-4, 2.5, 5)
    scene.add(sun)

    // satellites on orbits that pass over the AOI
    earth.updateMatrixWorld()
    const aoiWorld = aoiN.clone().applyMatrix4(new THREE.Matrix4().extractRotation(earth.matrixWorld)).normalize()
    const sats = [
      { name: 'SENTINEL-2B · MSI', kind: 'optical' as const, color: 0x38bdf8, css: '#38BDF8', tilt: 0.55, R: 1.42, speed: 0.16, phase: 0.2 },
      { name: 'SENTINEL-1A · C-SAR', kind: 'sar' as const, color: 0xf59e0b, css: '#D97706', tilt: -0.75, R: 1.55, speed: 0.12, phase: 2.6 },
    ].map((s) => {
      const u = aoiWorld.clone()
      const helper = Math.abs(u.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
      let v = new THREE.Vector3().crossVectors(u, helper).normalize()
      v = v.applyAxisAngle(u, s.tilt)
      v = new THREE.Vector3().crossVectors(v, u).normalize()
      const orbitPts: THREE.Vector3[] = []
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.03) orbitPts.push(u.clone().multiplyScalar(Math.cos(a) * s.R).add(v.clone().multiplyScalar(Math.sin(a) * s.R)))
      const orbit = new THREE.Line(new THREE.BufferGeometry().setFromPoints(orbitPts),
        new THREE.LineDashedMaterial({ color: s.color, dashSize: 0.05, gapSize: 0.025, transparent: true, opacity: 0.85 }))
      orbit.computeLineDistances()
      scene.add(orbit)
      const model = satellite(s.kind)
      model.scale.setScalar(1.25)
      scene.add(model)
      const glowTex = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64
        const g = c.getContext('2d')!
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
        gr.addColorStop(0, s.css); gr.addColorStop(0.35, s.css + '88'); gr.addColorStop(1, 'transparent')
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
        return new THREE.CanvasTexture(c)
      })()
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
      glow.scale.setScalar(0.32)
      scene.add(glow)
      const label = labelSprite(s.name, s.css)
      scene.add(label)
      const h = s.R - 1
      const coneGeo = new THREE.ConeGeometry(0.16, h, 40, 1, true)
      coneGeo.translate(0, -h / 2, 0)
      const beam = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }))
      scene.add(beam)
      const foot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 40), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
      scene.add(foot)
      return { ...s, u, v, model, label, beam, foot, glow }
    })

    // interaction: drag to rotate, gentle parallax
    let drag = false, lastX = 0, lastY = 0, userYaw = 0, userPitch = 0, mx = 0, my = 0, sx = 0, sy = 0
    const ray = new THREE.Raycaster()
    const down = (e: PointerEvent) => { drag = true; lastX = sx = e.clientX; lastY = sy = e.clientY }
    const up = (e: PointerEvent) => {
      const wasDrag = drag
      drag = false
      if (!wasDrag || Math.hypot(e.clientX - sx, e.clientY - sy) > 6 || !selRef.current) return
      const r = el.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
      const hits = ray.intersectObjects([globe, ...pickables.map((p) => p.obj)], false)
      const first = hits[0]
      const pk = first && pickables.find((p) => p.obj === first.object)
      if (pk) selRef.current(pk.id)
    }
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2
      my = ((e.clientY - r.top) / r.height - 0.5) * 2
      if (!drag) return
      userYaw += (e.clientX - lastX) * 0.006
      userPitch = Math.max(-0.6, Math.min(0.6, userPitch + (e.clientY - lastY) * 0.004))
      lastX = e.clientX; lastY = e.clientY
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    el.addEventListener('pointermove', move)

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el)
    resize()

    let raf = 0
    let lastPass: string | null = 'init'
    const clock = new THREE.Clock()
    const yAxis = new THREE.Vector3(0, -1, 0)
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const tick = () => {
      const t = still ? 6 : clock.getElapsedTime()
      earth.rotation.y = baseYaw + Math.sin(t * 0.07) * 0.32 + userYaw
      earth.rotation.x = (AOI.lat * Math.PI) / 180 * 0.85 + userPitch
      stars.rotation.y = t * 0.004
      camera.position.x += (mx * 0.25 - camera.position.x) * 0.03
      camera.position.y += (0.15 - my * 0.18 - camera.position.y) * 0.03
      camera.lookAt(0, 0, 0)
      rings.forEach((ring, i) => {
        const k = ((t * 0.6 + i / 3) % 1)
        ring.scale.setScalar(1 + k * 3.2)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k)
      })
      earth.updateMatrixWorld()
      const aoiNow = aoiN.clone().applyMatrix4(new THREE.Matrix4().extractRotation(earth.matrixWorld)).normalize()
      let passing: string | null = null
      for (const s of sats) {
        const a = t * s.speed + s.phase
        const pos = s.u.clone().multiplyScalar(Math.cos(a) * s.R).add(s.v.clone().multiplyScalar(Math.sin(a) * s.R))
        s.model.position.copy(pos)
        s.glow.position.copy(pos)
        const nadir = pos.clone().normalize().negate()
        s.model.quaternion.setFromUnitVectors(yAxis, nadir)
        s.model.rotateY(t * 0.2)
        s.label.position.copy(pos.clone().add(new THREE.Vector3(0.08, 0.06, 0)))
        const ang = pos.clone().normalize().angleTo(aoiNow)
        const on = Math.max(0, 1 - ang / 0.42)
        ;(s.beam.material as THREE.MeshBasicMaterial).opacity = 0.05 + 0.22 * on
        s.beam.position.copy(pos)
        s.beam.quaternion.setFromUnitVectors(yAxis, nadir)
        const fp = pos.clone().normalize().multiplyScalar(1.006)
        s.foot.position.copy(fp)
        s.foot.lookAt(fp.clone().multiplyScalar(2))
        ;(s.foot.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.4 * on
        if (on > 0.25) passing = s.name
        const facing = pos.z > -0.3
        s.label.visible = facing
      }
      if (passing !== lastPass) { lastPass = passing; passRef.current?.(passing) }
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      renderer.dispose()
      scene.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose?.()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.()
      })
      el.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gl])

  if (!gl) return (
    <div className={className} role="img" aria-label="Earth (3D view unavailable)">
      <div className="relative grid h-full w-full place-items-center">
        <div className="aspect-square w-[70%] max-w-[420px] rounded-full bg-cover bg-center shadow-[0_0_80px_rgba(86,145,255,.35)]" style={{ backgroundImage: 'url(/textures/earth-blue-marble.jpg)' }} />
        <span className="absolute bottom-3 font-mono text-[10px] text-ink-3">3D view unavailable (no WebGL): static Earth shown</span>
      </div>
    </div>
  )
  return <div ref={ref} className={className} style={{ cursor: 'grab', touchAction: 'pan-y' }} role="img" aria-label={`3D Earth with ${aois.length} monitored locations and Sentinel orbits`} />
}
