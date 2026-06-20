/**
 * Integration test: a real HTTP server backed by a real runLoop (with MockModel
 * + a fake tool), driven over HTTP/SSE exactly as the desktop app will. Hermetic
 * — no network, no API key; sessions in a temp dir.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockModel, SessionStore, AskUserTool, type Tool } from "kurt-agent";
import { createRuntime, productionRuntime, runTurn } from "./runtime.ts";
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
    makeTools: () => [echoShell],
    store: new SessionStore(sessions),
  });
  server = startServer(rt);
  return server;
}

/** Runtime with a tool that requires approval (calls permission.request). */
function startGated(script: ConstructorParameters<typeof MockModel>[0]): ServerHandle {
  const rt = createRuntime({
    workspace: ws,
    model: new MockModel(script),
    makeTools: (permission): Tool[] => [
      {
        spec: { name: "danger", description: "a sensitive op", inputSchema: { type: "object", properties: {} } },
        execute: async () => {
          const d = await permission.request({ key: "rm", title: "rm", command: "rm -rf x", explanation: "deletes", risk: "data loss" });
          return { content: d === "allow" ? "ran danger" : "denied by user", isError: d !== "allow" };
        },
      },
    ],
    store: new SessionStore(sessions),
  });
  server = startServer(rt);
  return server;
}

/** Drive a run, auto-answering the first approval frame with `decision`. */
async function runApprove(url: string, body: { text: string }, decision: "allow" | "always" | "deny"): Promise<RunFrame[]> {
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
      if (!line) continue;
      const f = JSON.parse(line.slice(6)) as RunFrame;
      frames.push(f);
      if (f.kind === "approval") {
        void fetch(url + "/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id, decision }) });
      }
    }
  }
  return frames;
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
    const id = session && session.kind === "session" ? session.id : "";
    expect(id).toBeTruthy();
    // A new session gets an immediate temp title (the first message) in the opening
    // frame; with no summarizer it stays that. (Also persisted right away — listable.)
    expect(session && session.kind === "session" && session.title).toBe("do the thing");
    const listed = (await (await fetch(h.url + `/sessions?workspace=${encodeURIComponent(ws)}`)).json()) as { id: string }[];
    expect(listed.some((s) => s.id === id)).toBe(true); // shows up mid-run, not only at the end
    const rec0 = (await (await fetch(h.url + `/sessions/${encodeURIComponent(id)}`)).json()) as { title: string };
    expect(rec0.title).toBe("do the thing");

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

  test("a new session's title is auto-summarized via makeTitle (empty until the turn finishes)", async () => {
    const rt = createRuntime({
      workspace: ws,
      model: new MockModel([{ text: "It's sunny." }]),
      makeTools: () => [echoShell],
      store: new SessionStore(sessions),
      makeTitle: async () => "Weather in Paris",
    });
    server = startServer(rt);
    const frames = await run(server.url, { text: "what's the weather in paris" });
    const session = frames.find((f) => f.kind === "session");
    const id = session && session.kind === "session" ? session.id : "";
    // opening frame: immediate temp title (the first message); replaced by the summary after the turn
    expect(session && session.kind === "session" && session.title).toBe("what's the weather in paris");
    const rec = (await (await fetch(server.url + `/sessions/${encodeURIComponent(id)}`)).json()) as { title: string };
    expect(rec.title).toBe("Weather in Paris");
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

  test("POST /sessions/:id/truncate keeps N user turns (rollback)", async () => {
    const h = startWith([{ text: "first" }, { text: "second" }]);
    const f1 = await run(h.url, { text: "q1" });
    const session = f1.find((f) => f.kind === "session");
    const id = session && session.kind === "session" ? session.id : "";
    await run(h.url, { sessionId: id, text: "q2" }); // now two user turns

    const res = await fetch(h.url + `/sessions/${encodeURIComponent(id)}/truncate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepUserTurns: 1 }),
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { steps: { type: string }[] };
    expect(out.steps.filter((s) => s.type === "user")).toHaveLength(1);

    // persisted: reloading the session also shows just one user turn
    const rec = (await (await fetch(h.url + `/sessions/${encodeURIComponent(id)}`)).json()) as { steps: { type: string }[] };
    expect(rec.steps.filter((s) => s.type === "user")).toHaveLength(1);
  }, 20_000);

  test("truncate on a missing session → 404", async () => {
    const h = startWith([{ text: "x" }]);
    const res = await fetch(h.url + `/sessions/nope/truncate`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keepUserTurns: 0 }),
    });
    expect(res.status).toBe(404);
  });

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

describe("approval round-trip", () => {
  test("a sensitive tool emits an approval frame; deny blocks it", async () => {
    const h = startGated([{ toolCalls: [{ name: "danger", input: {} }] }, { text: "ok" }]);
    const frames = await runApprove(h.url, { text: "do danger" }, "deny");
    const approval = frames.find((f) => f.kind === "approval");
    expect(approval && approval.kind === "approval" && approval.command).toBe("rm -rf x");
    const byId = new Map<number, Step>();
    for (const f of frames) if (f.kind === "step") byId.set(f.step._id, f.step);
    const tool = [...byId.values()].find((s) => s.type === "tool");
    expect(tool).toMatchObject({ type: "tool", out: "denied by user", isError: true });
  }, 20_000);

  test("allow lets it proceed", async () => {
    const h = startGated([{ toolCalls: [{ name: "danger", input: {} }] }, { text: "ok" }]);
    const frames = await runApprove(h.url, { text: "do danger" }, "allow");
    const byId = new Map<number, Step>();
    for (const f of frames) if (f.kind === "step") byId.set(f.step._id, f.step);
    const tool = [...byId.values()].find((s) => s.type === "tool");
    expect(tool).toMatchObject({ type: "tool", out: "ran danger", isError: false });
  }, 20_000);

  test("'always' allows subsequent same-key ops without a new approval frame", async () => {
    const h = startGated([
      { toolCalls: [{ name: "danger", input: {} }] }, { text: "first done" },
      { toolCalls: [{ name: "danger", input: {} }] }, { text: "second done" },
    ]);
    const f1 = await runApprove(h.url, { text: "first" }, "always");
    expect(f1.some((f) => f.kind === "approval")).toBe(true);

    // second run on the same runtime: the key is now allow-listed → NO approval frame
    const f2 = await runApprove(h.url, { text: "second" }, "deny");
    expect(f2.some((f) => f.kind === "approval")).toBe(false);
    const byId = new Map<number, Step>();
    for (const f of f2) if (f.kind === "step") byId.set(f.step._id, f.step);
    expect([...byId.values()].find((s) => s.type === "tool")).toMatchObject({ out: "ran danger" });
  }, 20_000);
});

describe("ask_user round-trip", () => {
  test("ask_user emits an `ask` frame; POST /answer feeds the answer back to the tool", async () => {
    const rt = createRuntime({
      workspace: ws,
      model: new MockModel([{ toolCalls: [{ name: "ask_user", input: { question: "Which one?", options: ["A", "B"] } }] }, { text: "done" }]),
      makeTools: (_permission, ask) => [new AskUserTool(ask)],
      store: new SessionStore(sessions),
    });
    server = startServer(rt);

    const res = await fetch(server.url + "/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "go" }) });
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
        if (!line) continue;
        const f = JSON.parse(line.slice(6)) as RunFrame;
        frames.push(f);
        if (f.kind === "ask") {
          void fetch(server.url + "/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id, answer: "B" }) });
        }
      }
    }

    const askFrame = frames.find((f) => f.kind === "ask");
    expect(askFrame && askFrame.kind === "ask" && askFrame.question).toBe("Which one?");
    const byId = new Map<number, Step>();
    for (const f of frames) if (f.kind === "step") byId.set(f.step._id, f.step);
    const tool = [...byId.values()].find((s) => s.type === "tool");
    expect(tool && tool.type === "tool" && tool.out).toContain("User answered: B");
  }, 20_000);
});

describe("plan frame", () => {
  const named = (name: string): Tool => ({ spec: { name, description: "", inputSchema: { type: "object", properties: {} } }, execute: async () => ({ content: "ok" }) });

  test("an update_plan tool call emits a `plan` frame with parsed steps", async () => {
    const model = new MockModel([
      { toolCalls: [{ name: "update_plan", input: { steps: [{ title: "A", status: "done" }, { title: "B" }] } }] },
      { text: "ok" },
    ]);
    const rt = createRuntime({ workspace: ws, model, makeTools: () => [named("update_plan")], store: new SessionStore(sessions) });
    const frames: RunFrame[] = [];
    await runTurn(rt, { text: "go", mode: "plan", signal: new AbortController().signal, onFrame: (f) => frames.push(f) });
    const plan = frames.find((f) => f.kind === "plan");
    expect(plan).toMatchObject({ kind: "plan", steps: [{ title: "A", status: "done" }, { title: "B", status: "pending" }] });
  }, 20_000);
});

describe("environment context", () => {
  test("each run's system prompt carries the current time + OS", async () => {
    const model = new MockModel([{ text: "hi" }]);
    const rt = createRuntime({ workspace: ws, model, makeTools: () => [], store: new SessionStore(sessions) });
    await runTurn(rt, { text: "hi", mode: "agent", signal: new AbortController().signal, onFrame: () => {} });
    const sys = model.requests[0]!.system;
    expect(sys).toContain("# Environment");
    expect(sys).toContain("Current time:");
    expect(sys).toMatch(/Operating system:/);
  });
});

describe("modes (tool gating)", () => {
  const named = (name: string): Tool => ({ spec: { name, description: "", inputSchema: { type: "object", properties: {} } }, execute: async () => ({ content: "ok" }) });
  const allNames = ["read_file", "ls", "grep", "web_search", "memory", "write_file", "shell", "update_plan", "request_write_access", "ask_user"];

  async function toolNamesForMode(mode: "chat" | "agent" | "plan"): Promise<string[]> {
    const model = new MockModel([{ text: "hi" }]);
    const rt = createRuntime({ workspace: ws, model, makeTools: () => allNames.map(named), store: new SessionStore(sessions) });
    await runTurn(rt, { text: "hi", mode, signal: new AbortController().signal, onFrame: () => {} });
    return model.requests[0]!.tools.map((t) => t.name);
  }

  test("chat mode → read-only tools only (no write/shell), plus ask_user", async () => {
    const names = await toolNamesForMode("chat");
    expect(names).toContain("read_file");
    expect(names).toContain("ask_user"); // available in every mode
    expect(names).not.toContain("write_file");
    expect(names).not.toContain("shell");
    expect(names).not.toContain("update_plan");
  });

  test("plan mode → read-only + update_plan, still no write/shell", async () => {
    const names = await toolNamesForMode("plan");
    expect(names).toContain("update_plan");
    expect(names).not.toContain("shell");
  });

  test("agent mode → all tools", async () => {
    const names = await toolNamesForMode("agent");
    expect(names).toContain("shell");
    expect(names).toContain("write_file");
  });
});

describe("model config (/info, /config)", () => {
  const savedHome = process.env.KURT_HOME;
  const savedKey = process.env.DEEPSEEK_API_KEY;
  let home = "";
  afterEach(() => {
    if (savedHome === undefined) delete process.env.KURT_HOME; else process.env.KURT_HOME = savedHome;
    if (savedKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = savedKey;
    if (home) rmSync(home, { recursive: true, force: true });
  });

  test("set the API key in-app; /info reflects it and it persists to ~/.kurt/desktop.json", async () => {
    home = realpathSync(mkdtempSync(join(tmpdir(), "bridge-home-")));
    process.env.KURT_HOME = home;
    delete process.env.DEEPSEEK_API_KEY; // start with no key
    server = startServer(productionRuntime(ws));

    let info = (await (await fetch(server.url + "/info")).json()) as { hasKey: boolean; models: string[]; workspace: string };
    expect(info.hasKey).toBe(false);
    expect(info.models).toContain("deepseek-v4-flash"); // composer model menu options
    expect(info.workspace).toBe(ws); // Files tab + terminal cwd

    const set = (await (await fetch(server.url + "/config", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey: "sk-test-123" }),
    })).json()) as { hasKey: boolean };
    expect(set.hasKey).toBe(true);

    info = (await (await fetch(server.url + "/info")).json()) as { hasKey: boolean; models: string[]; workspace: string };
    expect(info.hasKey).toBe(true);
    expect(existsSync(join(home, "desktop.json"))).toBe(true); // persisted (mode 0600)
  }, 20_000);

  test("GET/POST /config exposes the full desktop.json (baseURL / models / format)", async () => {
    home = realpathSync(mkdtempSync(join(tmpdir(), "bridge-home-")));
    process.env.KURT_HOME = home;
    delete process.env.DEEPSEEK_API_KEY;
    server = startServer(productionRuntime(ws));

    let cfg = (await (await fetch(server.url + "/config")).json()) as { apiKey: string; baseURL: string; models: string[]; format: string };
    expect(cfg.format).toBe("openai");
    expect(Array.isArray(cfg.models)).toBe(true);

    await fetch(server.url + "/config", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-x", baseURL: "https://gw.example/v1", models: ["m1", "m2"], format: "claude" }),
    });
    cfg = (await (await fetch(server.url + "/config")).json()) as { apiKey: string; baseURL: string; models: string[]; format: string };
    expect(cfg).toMatchObject({ apiKey: "sk-x", baseURL: "https://gw.example/v1", models: ["m1", "m2"], format: "claude" });

    const info = (await (await fetch(server.url + "/info")).json()) as { model: string; models: string[] };
    expect(info.models).toEqual(["m1", "m2"]); // composer menu follows the configured list
    expect(info.model).toBe("m1");
  }, 20_000);
});
