/**
 * The bridge HTTP/SSE server (Bun.serve), bound to localhost. The desktop app
 * drives it:
 *   POST   /run            { sessionId?, text }  → text/event-stream of RunFrames
 *   POST   /approve        { id, decision }      → resolve a sensitive-op approval
 *   POST   /answer         { id, answer }        → resolve an ask_user question
 *   GET    /fs?path=&workspace=    → { path, entries[] }  (dir listing, ws-confined)
 *   GET    /file?path=&workspace=  → { path, content, truncated }  (text preview)
 *   GET    /raw?path=&workspace=   → raw bytes (pdf/html/img for an <iframe>)
 *   GET    /sessions?workspace=                  → SessionInfo[]
 *   POST   /sessions                             → SessionInfo (new)
 *   GET    /sessions/:id                          → full SessionRecord
 *   POST   /sessions/:id/truncate  { keepUserTurns } → { steps } (rollback)
 *   DELETE /sessions/:id                          → { ok }
 *   GET    /health                                → { ok }
 *
 * Closing the /run response (client stop) aborts the run.
 */

import { runTurn, resolveApproval, resolveAsk, type Runtime, type ApprovalDecision, type Mode } from "./runtime.ts";
import type { DesktopConfig } from "./providers.ts";
import { messagesToSteps } from "./events.ts";
import { listDir, readTextFile, resolveInWorkspace, contentType } from "./fs.ts";
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
    // Disable Bun's default 10s idle timeout: the /run SSE stream is long-lived
    // and legitimately goes quiet — while the model thinks, while a tool runs, and
    // especially while a sensitive command's approval prompt waits for the human.
    // A 10s cap would close those connections (and abort the run via cancel()).
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

      if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (pathname === "/health") return json({ ok: true });

      // Model status (never returns the key itself) + in-app config (sets the key).
      if (pathname === "/info" && req.method === "GET") {
        return json(rt.info ? rt.info() : { hasKey: false, model: rt.model.name, models: [], providers: [], workspace: rt.workspace });
      }
      // GET → the full desktop.json (incl. the key — localhost, the user's own machine).
      if (pathname === "/config" && req.method === "GET") {
        return json(rt.fullConfig ? rt.fullConfig() : {});
      }
      if (pathname === "/config" && req.method === "POST") {
        const patch = (await req.json().catch(() => ({}))) as Partial<DesktopConfig>;
        rt.reconfigure?.(patch);
        return json(rt.info ? rt.info() : { hasKey: false, model: rt.model.name, models: [], providers: [], workspace: rt.workspace });
      }

      // Workspace file access (Files tab + preview), confined to the conversation's
      // workspace (?workspace=, falls back to the bridge default).
      if (pathname === "/fs" && req.method === "GET") {
        const root = url.searchParams.get("workspace") || rt.workspace;
        const listing = await listDir(root, url.searchParams.get("path") ?? "");
        return listing ? json(listing) : json({ error: "not found" }, 404);
      }
      if (pathname === "/file" && req.method === "GET") {
        const root = url.searchParams.get("workspace") || rt.workspace;
        const file = await readTextFile(root, url.searchParams.get("path") ?? "");
        return file ? json(file) : json({ error: "not found" }, 404);
      }
      // Raw bytes (pdf/html/images) for an <iframe>/<embed> src.
      if (pathname === "/raw" && req.method === "GET") {
        const root = url.searchParams.get("workspace") || rt.workspace;
        const reqPath = url.searchParams.get("path") ?? "";
        const full = reqPath ? resolveInWorkspace(root, reqPath) : null;
        if (!full) return new Response("not found", { status: 404, headers: CORS });
        const f = Bun.file(full);
        if (!(await f.exists())) return new Response("not found", { status: 404, headers: CORS });
        return new Response(f, { headers: { ...CORS, "Content-Type": contentType(reqPath), "Cache-Control": "no-cache" } });
      }

      if (pathname === "/run" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as RunBody;
        if (!body.text || !body.text.trim()) return json({ error: "text required" }, 400);
        return runSSE(rt, body);
      }

      if (pathname === "/approve" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { id?: string; decision?: ApprovalDecision };
        const ok = body.id ? resolveApproval(rt, body.id, body.decision ?? "deny") : false;
        return json({ ok });
      }

      if (pathname === "/answer" && req.method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { id?: string; answer?: string };
        const ok = body.id ? resolveAsk(rt, body.id, typeof body.answer === "string" ? body.answer : "") : false;
        return json({ ok });
      }

      if (pathname === "/sessions") {
        if (req.method === "GET") {
          // List ALL sessions globally (one unified history, not tied to the launch
          // workspace) — unless a workspace filter is explicitly requested.
          const workspace = url.searchParams.get("workspace") ?? undefined;
          return json((await rt.store.list(workspace)).map(toInfo));
        }
        if (req.method === "POST") {
          const rec = rt.store.create(rt.workspace, rt.model.name);
          await rt.store.save(rec);
          return json(toInfo(rec));
        }
      }

      // Rollback: keep only the first N user turns, drop that message and after.
      const mt = pathname.match(/^\/sessions\/(.+)\/truncate$/);
      if (mt && req.method === "POST") {
        const id = decodeURIComponent(mt[1]!);
        const body = (await req.json().catch(() => ({}))) as { keepUserTurns?: number };
        const keep = Math.max(0, Math.floor(Number(body.keepUserTurns ?? 0)));
        const rec = await rt.store.truncate(id, keep);
        if (!rec) return json({ error: "not found" }, 404);
        return json({ id: rec.id, title: rec.title, updatedAt: rec.updatedAt, steps: messagesToSteps(rec.messages) });
      }

      const m = pathname.match(/^\/sessions\/(.+)$/);
      if (m) {
        const id = decodeURIComponent(m[1]!);
        if (req.method === "GET") {
          const rec = await rt.store.load(id);
          if (!rec) return json({ error: "not found" }, 404);
          // Reconstruct the stored messages into renderable steps for the desktop.
          return json({ id: rec.id, title: rec.title, updatedAt: rec.updatedAt, workspace: rec.workspace, steps: messagesToSteps(rec.messages) });
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

interface RunBody {
  sessionId?: string;
  text?: string;
  model?: string;
  effort?: string;
  thinking?: boolean;
  mode?: Mode;
  /** The conversation's chosen workspace (folder picker). */
  workspace?: string;
}

/** Run one turn and stream its frames as Server-Sent Events. */
// SSE keep-alive: the webview's streaming fetch (WebKit) drops a connection that
// goes quiet too long (e.g. a slow first model token), surfacing as "Load failed".
// A periodic comment frame keeps the socket warm without affecting the data stream.
function heartbeatMs(): number { return Number(process.env.KURT_SSE_HEARTBEAT_MS) || 15000; }

function runSSE(rt: Runtime, body: RunBody): Response {
  const ctrl = new AbortController();
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (s: string): void => {
        try { controller.enqueue(enc.encode(s)); } catch { /* stream already closed */ }
      };
      const send = (f: RunFrame): void => write(`data: ${JSON.stringify(f)}\n\n`);
      const heartbeat = setInterval(() => write(`: ping\n\n`), heartbeatMs());

      runTurn(rt, { sessionId: body.sessionId, text: body.text!, model: body.model, effort: body.effort, thinking: body.thinking, mode: body.mode, workspace: body.workspace, signal: ctrl.signal, onFrame: send })
        // runTurn is meant to never throw, but if it ever rejects, surface it as a
        // graceful error frame instead of an unhandled rejection (which could crash
        // the bridge → drop every SSE connection).
        .catch((err: unknown) => send({ kind: "error", message: err instanceof Error ? err.message : String(err) }))
        .finally(() => {
          clearInterval(heartbeat);
          try { controller.close(); } catch { /* already closed */ }
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
