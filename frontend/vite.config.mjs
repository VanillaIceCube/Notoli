import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), ['REACT_APP_', 'PUBLIC_URL']);
  return {
    plugins: [react()],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.js',
      include: ['src/**/*.test.{js,jsx}'],
      clearMocks: true,
      testTimeout: 15000,
      unstubEnvs: true,
      unstubGlobals: true,
    },
    define: {
      'process.env.REACT_APP_API_BASE_URL':
        JSON.stringify(env.REACT_APP_API_BASE_URL) ?? 'undefined',
      'process.env.PUBLIC_URL': JSON.stringify(env.PUBLIC_URL ?? ''),
    },
    server: {
      host: process.env.HOST || 'localhost',
      port: 3000,
      strictPort: true,
      allowedHosts: ['notoli.localhost'],
      watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
    },
    build: {
      outDir: 'build',
      target: ['chrome117', 'edge121', 'firefox121', 'safari17'],
    },
  };
});
