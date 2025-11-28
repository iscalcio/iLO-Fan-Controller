import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 8000,
    proxy: {
      '/api': {
        target: 'http://localhost:8055',
        changeOrigin: true,
        secure: false,
      }
    }
  },
});
