/**
 * Slash-command registry + parsing/filtering (pure → testable). Execution lives
 * in the App (it touches state); this just describes the commands and powers the
 * "type / to see candidates" palette.
 */

export interface CommandSpec {
  name: string; // includes leading "/"
  summary: string;
  args?: string;
}

export const COMMANDS: CommandSpec[] = [
  { name: "/help", summary: "List commands" },
  { name: "/model", summary: "Pick a model from the list (or pass an id)", args: "[id]" },
  { name: "/mode", summary: "Switch mode", args: "[chat|agent|plan]" },
  { name: "/effort", summary: "Reasoning effort", args: "[low|medium|high]" },
  { name: "/think", summary: "Toggle thinking", args: "[on|off]" },
  { name: "/compact", summary: "Summarize & compress context" },
  { name: "/sessions", summary: "Browse / switch / delete saved sessions" },
  { name: "/skills", summary: "List loaded skills (view a skill's instructions)" },
  { name: "/mcp", summary: "List connected MCP servers (view their tools)" },
  { name: "/provider", summary: "Configure model providers / API keys" },
  { name: "/clear", summary: "Clear & start a fresh conversation" },
  { name: "/new", summary: "New session (also resets the sandbox temp)" },
  { name: "/exit", summary: "Quit" },
];

/** Candidate commands for the current input (empty unless it starts with "/"). */
export function filterCommands(input: string): CommandSpec[] {
  if (!input.startsWith("/")) return [];
  const word = input.slice(1).split(/\s/)[0]?.toLowerCase() ?? "";
  return COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(word));
}

export interface ParsedCommand {
  name: string; // includes leading "/"
  args: string[];
}

export function parseCommand(input: string): ParsedCommand | null {
  if (!input.startsWith("/")) return null;
  const parts = input.slice(1).trim().split(/\s+/).filter((p) => p.length > 0);
  return { name: `/${parts[0] ?? ""}`, args: parts.slice(1) };
}

export function isCommand(input: string): boolean {
  return input.startsWith("/");
}
