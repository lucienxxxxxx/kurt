/**
 * Shared tool handlers for the MCP test fixtures (stdio + HTTP). Three tools:
 * a read-only `echo`, a side-effecting `touch`, and a `boom` that errors.
 * Test-only — not a real server.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export function makeEchoServer(): Server {
  const server = new Server({ name: "echo-fixture", version: "0.0.1" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "echo",
        description: "Echo back the message.",
        inputSchema: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
        annotations: { readOnlyHint: true },
      },
      {
        name: "touch",
        description: "A side-effecting tool (no read-only hint).",
        inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
      {
        name: "boom",
        description: "Always returns an error result.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === "echo") {
      return { content: [{ type: "text", text: `echo: ${String((args as { message?: unknown })?.message ?? "")}` }] };
    }
    if (name === "touch") {
      return { content: [{ type: "text", text: `touched ${String((args as { path?: unknown })?.path ?? "")}` }] };
    }
    if (name === "boom") {
      return { content: [{ type: "text", text: "kaboom" }], isError: true };
    }
    return { content: [{ type: "text", text: `unknown tool ${name}` }], isError: true };
  });

  return server;
}
