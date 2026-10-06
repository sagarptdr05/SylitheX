import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(['^/api/', '^/docs', '^/openapi.json'].map((p) => [p, process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000'])),
  },
})
