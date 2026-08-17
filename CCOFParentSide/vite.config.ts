import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiUrl = (env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
    },
    server: {
      host: true,
      allowedHosts: true,
      proxy: {
        '/api': apiUrl,
        '/socket.io': apiUrl,
        '/health': apiUrl,
      },
    },
  };
});
