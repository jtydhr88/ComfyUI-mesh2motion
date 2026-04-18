import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    lib: {
      entry: resolve(__dirname, './src/main.ts'),
      formats: ['es'],
      fileName: 'main'
    },
    rollupOptions: {
      external: [
        '../../../scripts/app.js',
        '../../../scripts/api.js'
      ],
      output: {
        dir: 'js',
        entryFileNames: 'main.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    },
    sourcemap: true,
    minify: false
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  }
})
