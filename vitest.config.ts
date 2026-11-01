import { defineConfig } from 'vitest/config'

// Тесты запускаются через Electron в режиме Node (см. скрипт `test`),
// чтобы better-sqlite3 использовал ту же сборку, что и приложение.
// Тесты ядра (домен, база) идут дважды: на better-sqlite3 (Mac) и на SQLite WebAssembly (телефон, D57).
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
