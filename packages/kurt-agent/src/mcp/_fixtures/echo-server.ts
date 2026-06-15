/**
 * A minimal local MCP server over stdio — test fixture only (not a real tool).
 * Exposes the shared echo/touch/boom tools so the client integration test can
 * round-trip hermetically (no network). Run as a subprocess by the test:
 * `bun run src/mcp/_fixtures/echo-server.ts`.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { makeEchoServer } from "./echo-tools.ts";

await makeEchoServer().connect(new StdioServerTransport());
