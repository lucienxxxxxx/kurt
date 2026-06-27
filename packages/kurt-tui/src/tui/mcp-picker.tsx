import { Box, Text } from "ink";
import type { McpServerInfo } from "./mcp-info.ts";

/** Interactive MCP server list shown by `/mcp`. Keys are handled in App. */
export function McpPicker({ servers, selected }: { servers: McpServerInfo[]; selected: number }) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="blue" paddingX={1}>
      <Text color="blue" bold>
        MCP servers — ↑/↓ move · ↵ view tools · esc close
      </Text>
      {servers.length === 0 ? (
        <Text dimColor>No MCP servers configured. Add them in ~/.kurt/mcp.json or {"<workspace>"}/.kurt/mcp.json.</Text>
      ) : (
        servers.map((s, i) => (
          <Text key={s.name} inverse={i === selected} color={i === selected ? undefined : "gray"}>
            {`${(s.name || "(unnamed)").padEnd(20).slice(0, 20)}  ${s.ok ? "[ok]  " : "[fail]"}  ${s.toolCount} tools${s.error ? `  · ${s.error}` : ""}`}
          </Text>
        ))
      )}
    </Box>
  );
}
