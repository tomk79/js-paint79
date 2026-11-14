import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Paint79',
      formats: ['es', 'umd'],
      fileName: (format) => (format === 'es' ? 'paint79.mjs' : 'paint79.js'),
    },
    sourcemap: true,
    rollupOptions: {
      output: {
        exports: 'default',
      },
    },
  },
  server: {
    port: 5179,
    strictPort: true,
  },
});
