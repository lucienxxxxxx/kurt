/**
 * The bridge HTTP/SSE server (Bun.serve), bound to localhost. The desktop app
 * drives it:
 *   POST   /run            { sessionId?, text }  → text/event-stream of RunFrames
 *   GET    /sessions?workspace=                  → SessionInfo[]
 *   POST   /sessions                             → SessionInfo (new)
 *   GET    /sessions/:id                          → full SessionRecord
 *   DELETE /sessions/:id                          → { ok }
 *   GET    /health                                → { ok }
 *
 * Closing the /run response (client stop) aborts the run.
 */

import { runTurn, resolveApproval, type Runtime, type ApprovalDecision } from "./runtime.ts";
import { messagesToSteps } from "./events.ts";
import type { RunFrame, SessionInfo } from "./types.ts";

export interface ServerHandle {
  port: number;
  url: string;
  stop(): void;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function startServer(rt: Runtime, opts: { port?: number; host?: string } = {}): ServerHandle {
  const server = Bun.serve({
    port: opts.port ?? 0,
    hostname: opts.host ?? "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (pathname === "/health") return json({ ok: true });

      if (pathname === "/run" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { sessionId?: string; text?: string };
        if (!body.text || !body.text.trim()) return json({ error: "text required" }, 400);
        return runSSE(rt, body.sessionId, body.text);
      }

      if (pathname === "/approve" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { id?: string; decision?: ApprovalDecision };
        const ok = body.id ? resolveApproval(rt, body.id, body.decision ?? "deny") : false;
        return json({ ok });
      }

      if (pathname === "/sessions") {
        if (req.method === "GET") {
          // Default to THIS bridge's workspace so the desktop sees just its own history.
          const workspace = url.searchParams.get("workspace") ?? rt.workspace;
          return json((await rt.store.list(workspace)).map(toInfo));
        }
        if (req.method === "POST") {
          const rec = rt.store.create(rt.workspace, rt.model.name);
          await rt.store.save(rec);
          return json(toInfo(rec));
        }
      }

      const m = pathname.match(/^\/sessions\/(.+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]!);
        if (req.method === "GET") {
          const rec = await rt.store.load(id);
          if (!rec) return json({ error: "not found" }, 404);
          // Reconstruct the stored messages into renderable steps for the desktop.
          return json({ id: rec.id, title: rec.title, updatedAt: rec.updatedAt, steps: messagesToSteps(rec.messages) });
        }
        if (req.method === "DELETE") {
          await rt.store.remove(id);
          return json({ ok: true });
        }
      }

      return new Response("not found", { status: 404, headers: CORS });
    },
  });

  const port = server.port ?? 0;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    stop: () => server.stop(true),
  };
}

/** Run one turn and stream its frames as Server-Sent Events. */
function runSSE(rt: Runtime, sessionId: string | undefined, text: string): Response {
  const ctrl = new AbortController();
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (f: RunFrame): void => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };
      void runTurn(rt, { sessionId, text, signal: ctrl.signal, onFrame: send }).finally(() => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      ctrl.abort(); // client closed the stream (stop) → abort the run
    },
  });
  return new Response(stream, {
    headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

function toInfo(rec: { id: string; title: string; updatedAt: number; messageCount: number }): SessionInfo {
  return { id: rec.id, title: rec.title, updatedAt: rec.updatedAt, messageCount: rec.messageCount };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
