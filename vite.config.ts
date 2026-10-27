import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// أي طلب يبدأ بـ /api يتحول للخادم المحلي (بورت 3001)
const api = { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: api, allowedHosts: ['.app.github.dev'] },
  preview: { proxy: api, allowedHosts: ['.app.github.dev'] },
})
