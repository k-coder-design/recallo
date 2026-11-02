import { defineConfig } from 'vitest/config'

// Tests run through Electron in Node mode (see the `test` script),
// so better-sqlite3 uses the same build as the app.
// Core tests (domain, database) run twice: on better-sqlite3 (Mac) and on SQLite WebAssembly (phone, D57).
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['src/main/db/testDatabase.setup.ts'],
    projects: [
      { extends: true, test: { name: 'mac', include: ['src/**/*.test.ts'], exclude: ['src/main/db/wasm.test.ts'] } },
      {
        extends: true,
        test: {
          name: 'phone',
          include: ['src/main/domain/**/*.test.ts', 'src/main/db/wasm.test.ts', 'src/shared/**/*.test.ts'],
          env: { RECALLO_DB: 'wasm' }
        }
      }
    ]
  }
})
