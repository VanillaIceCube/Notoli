import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          pool: 'forks',
          include: [
            'src/services/authentication/authRedirect.test.js',
            'src/services/navigation/navigationService.test.js',
            'src/services/notepad/notoliApiClient.test.js',
            'src/services/authentication/authApiClient.test.js',
            'src/services/notifications/notificationApiClient.test.js',
            'src/utils/navigation.test.js',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          pool: 'vmForks',
          vmMemoryLimit: '384MB',
          include: ['src/**/*.test.{js,jsx}'],
          exclude: [
            'src/services/authentication/authRedirect.test.js',
            'src/services/navigation/navigationService.test.js',
            'src/services/notepad/notoliApiClient.test.js',
            'src/services/authentication/authApiClient.test.js',
            'src/services/notifications/notificationApiClient.test.js',
            'src/utils/navigation.test.js',
          ],
          deps: {
            optimizer: {
              client: {
                enabled: true,
                include: [
                  '@mui/material',
                  '@mui/material/styles',
                  '@emotion/react',
                  '@emotion/styled',
                ],
              },
            },
          },
        },
      },
    ],
    setupFiles: './src/test-helpers/setup.js',
    clearMocks: true,
    testTimeout: 15000,
    unstubEnvs: true,
    unstubGlobals: true,
  },
  server: {
    host: process.env.HOST || 'localhost',
    port: 3000,
    strictPort: true,
    allowedHosts: ['notoli.localhost'],
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
  },
  build: {
    outDir: 'dist',
    target: ['chrome117', 'edge121', 'firefox121', 'safari17'],
  },
});
