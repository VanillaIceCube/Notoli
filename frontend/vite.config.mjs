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
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            pool: 'forks',
            include: [
              'src/__tests__/eslintConfig.test.js',
              'src/__tests__/notoliThemeStyles.test.js',
              'src/services/authRedirect.test.js',
              'src/services/navigationService.test.js',
              'src/services/notoliApiClient.test.js',
              'src/utils/Navigation.test.js',
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
              'src/__tests__/eslintConfig.test.js',
              'src/__tests__/notoliThemeStyles.test.js',
              'src/services/authRedirect.test.js',
              'src/services/navigationService.test.js',
              'src/services/notoliApiClient.test.js',
              'src/utils/Navigation.test.js',
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
      setupFiles: './src/setupTests.js',
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
