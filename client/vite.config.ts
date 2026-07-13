import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Back-end dev server port; keep in sync with the PORT the server reads.
const port = process.env.PORT ?? '3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // In dev, the Vite server proxies the websocket to the back end so the
      // front end always connects same-origin at /ws.
      '/ws': {
        target: `ws://localhost:${port}`,
        ws: true,
      },
      // Wiki files (.md/.oui) come straight from the back end.
      '/docs': {
        target: `http://localhost:${port}`,
      },
      // Back-end JSON endpoints (e.g. /api/wiki/files for the Home view).
      '/api': {
        target: `http://localhost:${port}`,
      },
    },
  },
})
