import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import yaml from '@modyfi/vite-plugin-yaml';

export default defineConfig(({ mode }) => ({
  plugins: [react(), yaml()],
  build: {
    sourcemap: mode === 'production' ? 'hidden' : true,
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/packages/engine/dist/src/')) {
            return 'engine-runtime';
          }
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('/node_modules/pixi.js/')
            || id.includes('/node_modules/@pixi/react/')
            || id.includes('/node_modules/pixi-viewport/')) {
            return 'vendor-pixi';
          }
          if (id.includes('/node_modules/gsap/')) {
            return 'vendor-gsap';
          }
          if (id.includes('/node_modules/graphology/')
            || id.includes('/node_modules/graphology-layout-forceatlas2/')) {
            return 'vendor-graph';
          }
          return undefined;
        },
      },
    },
  },
}));
