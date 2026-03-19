import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': 'http://localhost:8788'
    }
  },
  build: {
    outDir: 'public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
});
