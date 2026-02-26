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
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-pixi': ['pixi.js', '@pixi/react', 'pixi-viewport'],
          'vendor-gsap': ['gsap'],
          'vendor-graph': ['graphology', 'graphology-layout-forceatlas2'],
        },
      },
    },
  },
}));
