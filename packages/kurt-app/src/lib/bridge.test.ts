import { afterEach, describe, expect, test, vi } from "vitest";
import { runStream, listSessions, getInfo, setConfig, type RunFrame } from "./bridge.ts";
import type { Step } from "../types.ts";

afterEach(() => vi.restoreAllMocks());

function sseResponse(frames: RunFrame[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(`data: ${JSON.stringify(f)}\n\n`));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("runStream", () => {
  test("dispatches session, step (upsert by _id), usage frames; resolves on done", async () => {
    const frames: RunFrame[] = [
      { kind: "session", id: "s1", title: "do it" },
      { kind: "step", step: { _id: 1, type: "thinking", text: "hmm" } },
      { kind: "step", step: { _id: 2, type: "text", text: "Hello" } },
      { kind: "step", step: { _id: 2, type: "text", text: "Hello world" } }, // same _id, updated
      { kind: "usage", inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      { kind: "done" },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(frames)));

    const seenSteps: Step[] = [];
    let session = "";
    let usage = 0;
    await runStream("http://x", { text: "do it" }, {
      onSession: (id) => { session = id; },
      onStep: (s) => seenSteps.push(s),
      onUsage: (u) => { usage = u.totalTokens; },
    });

    expect(session).toBe("s1");
    expect(usage).toBe(15);
    // last write for _id 2 wins after upsert
    const byId = new Map<number, Step>();
    for (const s of seenSteps) byId.set(s._id, s);
    expect(byId.get(2)).toMatchObject({ type: "text", text: "Hello world" });
    expect(byId.get(1)).toMatchObject({ type: "thinking" });
  });

  test("error frame → onError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([{ kind: "error", message: "boom" }])));
    let msg = "";
    await runStream("http://x", { text: "t" }, { onError: (m) => { msg = m; } });
    expect(msg).toBe("boom");
  });

  test("non-ok response → onError, no throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    let msg = "";
    await runStream("http://x", { text: "t" }, { onError: (m) => { msg = m; } });
    expect(msg).toContain("500");
  });
});

describe("listSessions", () => {
  test("returns the parsed array", async () => {
    const data = [{ id: "a", title: "A", updatedAt: 1, messageCount: 2 }];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(data), { status: 200 })));
    expect(await listSessions("http://x", "/ws")).toEqual(data);
  });

  test("non-ok → empty", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    expect(await listSessions("http://x")).toEqual([]);
  });
});

describe("getInfo / setConfig", () => {
  test("getInfo returns model/key status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hasKey: true, model: "deepseek-v4-flash" }), { status: 200 })));
    expect(await getInfo("http://x")).toEqual({ hasKey: true, model: "deepseek-v4-flash" });
  });

  test("setConfig POSTs the provider patch and returns updated status", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ hasKey: true, model: "gpt-4o" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const patch = { providers: { openai: { enabled: true, apiKey: "sk-abc" } } } as never;
    const info = await setConfig("http://x", patch);
    expect(info?.hasKey).toBe(true);
    const init = fetchMock.mock.calls[0]![1]!;
    expect(JSON.parse(init.body as string)).toEqual({ providers: { openai: { enabled: true, apiKey: "sk-abc" } } });
  });
});
