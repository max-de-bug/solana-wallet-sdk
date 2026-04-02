import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      'rpc-websockets/dist/lib/client': resolve(__dirname, '__mocks__/rpc-client.js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**'],
    },
  },
});
