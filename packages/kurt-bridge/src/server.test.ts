/**
 * Integration test: a real HTTP server backed by a real runLoop (with MockModel
 * + a fake tool), driven over HTTP/SSE exactly as the desktop app will. Hermetic
 * — no network, no API key; sessions in a temp dir.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockModel, SessionStore, type Tool } from "kurt-agent";
import { createRuntime } from "./runtime.ts";
import { startServer, type ServerHandle } from "./server.ts";
import type { RunFrame, Step } from "./types.ts";

const echoShell: Tool = {
  spec: { name: "shell", description: "run a command", inputSchema: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } },
  execute: async (input) => ({ content: `ran: ${(input as { command?: string }).command ?? ""}` }),
};

let ws: string;
let sessions: string;
let server: ServerHandle;

beforeEach(() => {
  ws = realpathSync(mkdtempSync(join(tmpdir(), "bridge-ws-")));
  sessions = realpathSync(mkdtempSync(join(tmpdir(), "bridge-sess-")));
});
afterEach(() => {
  server?.stop();
  rmSync(ws, { recursive: true, force: true });
  rmSync(sessions, { recursive: true, force: true });
});

function startWith(script: ConstructorParameters<typeof MockModel>[0]): ServerHandle {
  const rt = createRuntime({
    workspace: ws,
    model: new MockModel(script),
    tools: [echoShell],
    store: new SessionStore(sessions),
  });
  server = startServer(rt);
  return server;
}

async function run(url: string, body: { sessionId?: string; text: string }): Promise<RunFrame[]> {
  const res = await fetch(url + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const frames: RunFrame[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = block.split("\n").find((l) => l.startsWith("data: "));
      if (line) frames.push(JSON.parse(line.slice(6)) as RunFrame);
    }
  }
  return frames;
}

describe("bridge server /run (SSE)", () => {
  test("streams session → steps → done for a real turn (thinking, text, tool)", async () => {
    const h = startWith([
      { thinking: "let me run it", text: "Running the command.", toolCalls: [{ name: "shell", input: { command: "echo hi" } }] },
      { text: "All done." },
    ]);
    const frames = await run(h.url, { text: "do the thing" });

    const kinds = frames.map((f) => f.kind);
    expect(kinds[0]).toBe("session");
    expect(kinds[kinds.length - 1]).toBe("done");

    const session = frames.find((f) => f.kind === "session");
    expect(session && session.kind === "session" && session.title).toBe("do the thing");

    // The client upserts step frames by _id (a step is re-sent as it changes);
    // fold to the final snapshot per _id, as the desktop will.
    const byId = new Map<number, Step>();
    for (const f of frames) if (f.kind === "step") byId.set(f.step._id, f.step);
    const steps = [...byId.values()];
    expect(steps.some((s) => s.type === "thinking")).toBe(true);
    expect(steps.some((s) => s.type === "text" && s.text === "Running the command.")).toBe(true);
    expect(steps.some((s) => s.type === "text" && s.text === "All done.")).toBe(true);
    const tool = steps.find((s) => s.type === "tool");
    expect(tool).toMatchObject({ type: "tool", name: "shell", cmd: "echo hi", out: "ran: echo hi" });
  }, 20_000);

  test("the run persists the session; it then appears in GET /sessions and survives a second turn", async () => {
    const h = startWith([{ text: "first" }, { text: "second" }]);
    const f1 = await run(h.url, { text: "hello" });
    const session = f1.find((f) => f.kind === "session");
    const id = session && session.kind === "session" ? session.id : "";
    expect(id).toBeTruthy();

    const list = (await (await fetch(h.url + `/sessions?workspace=${encodeURIComponent(ws)}`)).json()) as { id: string; messageCount: number }[];
    expect(list.some((s) => s.id === id)).toBe(true);

    // second turn on the same session → history grows; reload returns reconstructed steps
    await run(h.url, { sessionId: id, text: "again" });
    const rec = (await (await fetch(h.url + `/sessions/${encodeURIComponent(id)}`)).json()) as { steps: { type: string }[] };
    expect(rec.steps.length).toBeGreaterThanOrEqual(4); // user+text ×2 turns
    expect(rec.steps.filter((s) => s.type === "user")).toHaveLength(2);
  }, 20_000);

  test("DELETE removes a session", async () => {
    const h = startWith([{ text: "x" }]);
    const id = (await (await fetch(h.url + "/sessions", { method: "POST" })).json() as { id: string }).id;
    expect((await fetch(h.url + `/sessions/${id}`)).status).toBe(200);
    await fetch(h.url + `/sessions/${id}`, { method: "DELETE" });
    expect((await fetch(h.url + `/sessions/${id}`)).status).toBe(404);
  }, 20_000);

  test("missing text → 400", async () => {
    const h = startWith([{ text: "x" }]);
    const res = await fetch(h.url + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    expect(res.status).toBe(400);
  });

  test("/health → ok", async () => {
    const h = startWith([{ text: "x" }]);
    expect(((await (await fetch(h.url + "/health")).json()) as { ok: boolean }).ok).toBe(true);
  });
});
