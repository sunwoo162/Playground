import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/apps/voice-studio/',
  plugins: [react()],
  server: {
    port: 5192,
  },
});
