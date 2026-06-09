import { Box, Text } from "ink";
import { COMMANDS } from "./commands.ts";

/**
 * Empty-state panel shown before any conversation: a one-line intro + the
 * available commands. It lives in the dynamic region, so it disappears as soon
 * as the first message is sent (and returns after /clear or /new).
 */
export function Welcome() {
  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text>kurt-agent — a local, sandboxed coding agent. Just type to chat, or use a command:</Text>
      <Box flexDirection="column" marginTop={1}>
        {COMMANDS.map((c) => (
          <Box key={c.name}>
            <Text color="cyan">{c.name.padEnd(10)}</Text>
            <Text dimColor>{(c.args ? c.args + "  " : "") + c.summary}</Text>
          </Box>
        ))}
      </Box>
      <Text dimColor>{'\nTip: type "/" to autocomplete · ↑↓ to pick · Esc interrupts · mouse-wheel scrolls history'}</Text>
    </Box>
  );
}
