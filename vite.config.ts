import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Firebase 與 React 很少更新，獨立成檔案，改版時瀏覽器可以沿用快取
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore/lite'],
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
