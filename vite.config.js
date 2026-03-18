
import { defineConfig } from 'vite';

export default defineConfig({
  // 禁用 Vite 的 public 目录功能，避免与 outDir 冲突
  publicDir: false,
  server: {
    port: 5173,
    host: true
  },
  build: {
    outDir: 'public',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // 使用固定文件名，避免 hash 导致引用路径问题
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  }
});
