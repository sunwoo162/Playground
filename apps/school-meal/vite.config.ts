import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildVersion = process.env.BUILD_VERSION || String(Date.now());

export default defineConfig({
  plugins: [react()],
  base: '/apps/school-meal/',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${buildVersion}-[hash].js`,
        chunkFileNames: `assets/[name]-${buildVersion}-[hash].js`,
      },
    },
  },
})
