import { defineConfig } from 'vitest/config';
import yaml from '@modyfi/vite-plugin-yaml';

export default defineConfig({
  plugins: [yaml()],
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    css: true,
  },
});
