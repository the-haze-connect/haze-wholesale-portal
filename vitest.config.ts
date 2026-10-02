import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'test/empty.ts'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
