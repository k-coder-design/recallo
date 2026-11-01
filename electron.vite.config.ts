import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      // Словарь произношений и данные эмодзи встраиваем в сборку main, а не подключаем из node_modules.
      externalizeDeps: { exclude: ['cmu-pronouncing-dictionary', 'emojibase-data'] }
    }
  },
  preload: {},
  renderer: {
    plugins: [react()],
    define: { __RECALLO_PLATFORM__: JSON.stringify('mac') }
  }
})
