/**
 * In-process Streamable HTTP MCP server — test fixture only. Serves the shared
 * echo/touch/boom tools over the SDK's web-standard HTTP transport via Bun.serve,
 * so the HTTP client path gets a real round-trip test (hermetic, localhost).
 *
 * Stateless mode (no session id, JSON responses): a fresh server+transport per
 * request, which is the SDK's documented stateless pattern.
 */

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { makeEchoServer } from "./echo-tools.ts";

export interface HttpEchoServer {
  url: string;
  close: () => Promise<void>;
}

export async function startHttpEchoServer(): Promise<HttpEchoServer> {
  const server = Bun.serve({
    port: 0, // ephemeral
    idleTimeout: 30,
    async fetch(req) {
      if (new URL(req.url).pathname !== "/mcp") return new Response("not found", { status: 404 });
      const mcp = makeEchoServer();
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true, // plain JSON responses (no SSE) — simplest for tests
      });
      await mcp.connect(transport);
      const res = await transport.handleRequest(req);
      void mcp.close();
      return res;
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/mcp`,
    close: async () => {
      server.stop(true);
    },
  };
}
