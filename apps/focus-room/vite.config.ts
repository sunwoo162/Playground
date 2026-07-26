import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/apps/focus-room/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
