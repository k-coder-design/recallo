// Recallo MCP server (stdio). It is started by the Recallo binary with ELECTRON_RUN_AS_NODE=1,
// so agents do not need a separately installed Node. All the logic lives in the app API.
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
