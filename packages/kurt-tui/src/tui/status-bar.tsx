import { Box, Text } from "ink";
import { formatTokens, scarcityColor } from "./theme.ts";

export type ChatMode = "chat" | "agent" | "plan";

export interface Status {
  model: string;
  contextUsed: number;
  contextLimit: number;
  effort: string;
  thinking: boolean;
  mode: ChatMode;
  running: boolean;
}

/** Bottom status bar: model · context (with scarcity dot) · effort · thinking · mode. */
export function StatusBar({ status, width }: { status: Status; width: number }) {
  const dot = scarcityColor(status.contextUsed, status.contextLimit);
  const ctx = `${formatTokens(status.contextUsed)}/${formatTokens(status.contextLimit)}`;
  const model = truncate(status.model, 26);

  return (
    <Box flexDirection="column" width={width}>
      <Text dimColor>{"─".repeat(Math.max(1, width))}</Text>
      {/* Single nowrap row; clips on very narrow terminals rather than wrapping. */}
      <Box width={width} overflow="hidden">
        <Text>{status.running ? "◐ " : "● "}</Text>
        <Text bold color="magenta">
          {model}
        </Text>
        <Text dimColor>{"  ctx "}</Text>
        <Text>{`${ctx} `}</Text>
        <Text color={dot}>{"●"}</Text>
        <Text dimColor>{"  effort:"}</Text>
        <Text>{status.effort}</Text>
        <Text dimColor>{"  think:"}</Text>
        <Text color={status.thinking ? "green" : "gray"}>{status.thinking ? "on" : "off"}</Text>
        <Text dimColor>{"  "}</Text>
        <Text color="blueBright">{`[${status.mode}]`}</Text>
      </Box>
    </Box>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
