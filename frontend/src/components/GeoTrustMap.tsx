import 'leaflet/dist/leaflet.css'
import { ImageOverlay, MapContainer, Polygon, TileLayer, Tooltip } from 'react-leaflet'
import { scoreColor } from '../lib/format'
import type { Tile } from '../lib/types'

interface Props { bbox: number[]; image: string; tiles: Tile[]; showTiles: boolean; onTile: (id: string) => void; selected: string | null; imageOpacity?: number; height?: number }

export default function GeoTrustMap({ bbox, image, tiles, showTiles, onTile, selected, imageOpacity = 1, height = 520 }: Props) {
  const [w, s, e, n] = bbox
  const bounds: [[number, number], [number, number]] = [[s, w], [n, e]]
  return (
    <div className="hud-corners overflow-hidden rounded-2xl border" style={{ height, borderColor: 'rgba(14,165,233,.6)' }}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }} zoomSnap={0.25} scrollWheelZoom attributionControl>
        <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" attribution="Basemap © Esri" maxZoom={18} />
        <ImageOverlay url={image} bounds={bounds} opacity={imageOpacity} />
        {showTiles && tiles.map((t) => (
          <Polygon key={t.id} positions={t.polygon.map(([lo, la]) => [la, lo] as [number, number])}
            pathOptions={{ color: selected === t.id ? '#FFFFFF' : '#ffffff', weight: selected === t.id ? 3 : 0.6, fillColor: scoreColor(t.score), fillOpacity: selected === t.id ? 0.75 : 0.55 }}
            eventHandlers={{ click: () => onTile(t.id) }}>
            <Tooltip sticky><span style={{ fontFamily: 'JetBrains Mono' }}>{t.id} · trust {t.score.toFixed(0)} · {t.status}</span></Tooltip>
          </Polygon>
        ))}
      </MapContainer>
    </div>
  )
}
