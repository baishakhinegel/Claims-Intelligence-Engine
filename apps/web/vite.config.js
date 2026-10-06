import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to NestJS, so the browser sees one origin
// (no CORS in development) and the frontend code uses relative URLs.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
