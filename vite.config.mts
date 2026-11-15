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
        // 組み込んだライブラリのライセンス表示の所在を示す。banner は UMD 版の圧縮で消えるため、
        // 圧縮の後に付ける postBanner を使う
        postBanner:
          '/*! @tomk79/paint79 | MIT License | includes ag-psd (MIT), pako (MIT AND Zlib), base64-js (MIT). See THIRD-PARTY-NOTICES.txt */',
      },
    },
  },
  server: {
    port: 5179,
    strictPort: true,
  },
});
