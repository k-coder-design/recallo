import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      // Bundle the pronunciation dictionary and emoji data into main instead of loading them from node_modules.
      externalizeDeps: { exclude: ['cmu-pronouncing-dictionary', 'emojibase-data'] }
    }
  },
  preload: {},
  renderer: {
    plugins: [react()],
    define: { __RECALLO_PLATFORM__: JSON.stringify('mac') }
  }
})
