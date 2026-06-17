import { describe, expect, test } from "bun:test";
import { truncateToUserTurns } from "./store.ts";
import type { Message } from "../engine/index.ts";

const u = (t: string): Message => ({ role: "user", content: [{ type: "text", text: t }] });
const a = (t: string): Message => ({ role: "assistant", content: [{ type: "text", text: t }] });

// user₀ a₀ user₁ a₁ user₂ a₂  → indices 0..5
const convo: Message[] = [u("q0"), a("r0"), u("q1"), a("r1"), u("q2"), a("r2")];

describe("truncateToUserTurns", () => {
  test("keep 0 turns → empty", () => {
    expect(truncateToUserTurns(convo, 0)).toEqual([]);
    expect(truncateToUserTurns(convo, -1)).toEqual([]);
  });

  test("keep 1 turn → only the first user message + its reply", () => {
    expect(truncateToUserTurns(convo, 1)).toEqual([u("q0"), a("r0")]);
  });

  test("keep 2 turns → drops user₂ and everything after", () => {
    expect(truncateToUserTurns(convo, 2)).toEqual([u("q0"), a("r0"), u("q1"), a("r1")]);
  });

  test("keep more turns than exist → unchanged copy", () => {
    const out = truncateToUserTurns(convo, 99);
    expect(out).toEqual(convo);
    expect(out).not.toBe(convo); // a copy, not the same array
  });

  test("does not mutate the input", () => {
    const input = [u("q0"), a("r0"), u("q1")];
    const snapshot = [...input];
    truncateToUserTurns(input, 1);
    expect(input).toEqual(snapshot);
  });
});
