import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Allow the Daytona preview proxy host(s) to reach the dev server.
    allowedHosts: ['.daytonaproxy01.net', '.daytonaproxy.net'],
  },
})
