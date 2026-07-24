import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/apps/code-run-visualizer/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
