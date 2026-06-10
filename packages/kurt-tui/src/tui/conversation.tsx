import { Box, Text } from "ink";
import { type Entry } from "./entries.ts";
import { renderMarkdown } from "./markdown.ts";
import { clip, formatToolInput, labeled, toolLabel, toolSummary } from "./tool-format.ts";

export function EntryView({ entry, width, live }: { entry: Entry; width: number; live: boolean }) {
  switch (entry.kind) {
    case "user":
      // A horizontal rule separates each exchange (prior kurt reply ↔ new turn).
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{"─".repeat(Math.max(1, width))}</Text>
          <Text color="green" bold>
            you
          </Text>
          <Text>{entry.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text color="cyanBright" bold>
            kurt
          </Text>
          {/* Plain while streaming; finalized reply rendered as markdown. */}
          <Text>{live ? entry.text : renderMarkdown(entry.text, Math.max(20, width - 1))}</Text>
        </Box>
      );
    case "thinking":
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text color="gray">✿ thinking</Text>
          <Text color="gray">{entry.text}</Text>
        </Box>
      );
    case "tool": {
      const done = entry.result !== undefined;
      // Finished → the formatted result (head); still running → live stream tail.
      const out = done ? clip(entry.result!, 12, 800) : entry.stream ? tail(entry.stream, 10) : null;
      const summary = toolSummary(entry.name, entry.input);
      return (
        <Box flexDirection="column" marginTop={1}>
          {/* marker + tool name + an optional brief one-liner, then IN:/OUT:. */}
          <Text color="yellow" bold>
            {`⚙ ${toolLabel(entry.name)}`}
            {summary ? <Text dimColor>{`  ${summary}`}</Text> : null}
            {done ? "" : " ⠿"}
          </Text>
          <Text dimColor>{labeled("IN: ", formatToolInput(entry.name, entry.input))}</Text>
          {out && (
            <Text color={entry.isError ? "red" : undefined} dimColor={!entry.isError}>
              {labeled(done && entry.isError ? "ERR:" : "OUT:", out.text)}
              {out.clipped ? "\n     … (truncated)" : ""}
            </Text>
          )}
        </Box>
      );
    }
    case "notice":
      return (
        <Text color={entry.level === "error" ? "red" : entry.level === "warn" ? "yellow" : "gray"}>
          {entry.level === "error" ? "✗ " : entry.level === "warn" ? "⚠ " : "⟳ "}
          {entry.text}
        </Text>
      );
  }
}

/** Last `maxLines` of streaming output (the live tail is what matters). */
function tail(text: string, maxLines: number): { text: string; clipped: boolean } {
  const lines = text.replace(/\s+$/, "").split("\n");
  return { text: lines.length <= maxLines ? lines.join("\n") : lines.slice(-maxLines).join("\n"), clipped: false };
}
