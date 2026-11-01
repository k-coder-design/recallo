// MCP-сервер Recallo (stdio). Запускается бинарником Recallo с ELECTRON_RUN_AS_NODE=1,
// поэтому агентам не нужен отдельно установленный Node. Вся логика — в API приложения.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import pkg from '../../package.json'
import { RecalloClient } from './client'
import { createRecalloServer } from './tools'

async function main(): Promise<void> {
  const server = createRecalloServer(new RecalloClient(), pkg.version)
  await server.connect(new StdioServerTransport())
}

main().catch((error: unknown) => {
  console.error('Recallo MCP server failed to start:', error)
  process.exit(1)
})
