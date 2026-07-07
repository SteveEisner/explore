import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
})
