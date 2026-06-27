import { describe, expect, test } from "bun:test";
import { COMMANDS, filterCommands, isCommand, parseCommand } from "./commands.ts";

describe("slash commands", () => {
  test("isCommand", () => {
    expect(isCommand("/model")).toBe(true);
    expect(isCommand("hello")).toBe(false);
  });

  test("filterCommands prefix-matches the first word", () => {
    expect(filterCommands("/mo").map((c) => c.name)).toEqual(["/model", "/mode"]);
    expect(filterCommands("/")).toHaveLength(COMMANDS.length);
    expect(filterCommands("hi")).toEqual([]);
    expect(filterCommands("/model deep")).toEqual([{ name: "/model", summary: "Pick a model from the list (or pass an id)", args: "[id]" }]);
  });

  test("parseCommand splits name and args", () => {
    expect(parseCommand("/model deepseek-v4-pro")).toEqual({ name: "/model", args: ["deepseek-v4-pro"] });
    expect(parseCommand("/compact")).toEqual({ name: "/compact", args: [] });
    expect(parseCommand("plain")).toBeNull();
  });

  test("/skills is registered and discoverable from the palette", () => {
    expect(COMMANDS.some((c) => c.name === "/skills")).toBe(true);
    expect(filterCommands("/sk").map((c) => c.name)).toEqual(["/skills"]);
  });

  test("/mcp is registered and discoverable from the palette", () => {
    expect(COMMANDS.some((c) => c.name === "/mcp")).toBe(true);
    expect(filterCommands("/mc").map((c) => c.name)).toEqual(["/mcp"]);
  });

  test("/provider is registered and discoverable from the palette", () => {
    expect(COMMANDS.some((c) => c.name === "/provider")).toBe(true);
    expect(filterCommands("/prov").map((c) => c.name)).toEqual(["/provider"]);
  });
});
