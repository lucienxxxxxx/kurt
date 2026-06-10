import { Box, Text } from "ink";
import type { PendingAsk } from "./ask.ts";

const LETTERS = "ABCDEFGHIJ";

/** The prompt shown while the agent's `ask_user` awaits the user. Navigate options
 * with ↑/↓ and press ↵ to pick the highlighted one, or just type a free answer. */
export function AskPrompt({ pending, input, selected }: { pending: PendingAsk; input: string; selected: number }) {
  const typing = input.length > 0;
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="magenta" bold>
        {`❓ ${pending.question}`}
      </Text>
      {pending.options.map((opt, i) => (
        <Text key={i} inverse={!typing && i === selected} color={!typing && i === selected ? undefined : "gray"}>
          {`  ${LETTERS[i] ?? "-"}. ${opt}`}
        </Text>
      ))}
      <Box marginTop={pending.options.length > 0 ? 1 : 0}>
        <Text color="magenta">{"› "}</Text>
        <Text>{input}</Text>
        {!typing && (
          <Text dimColor>
            {pending.options.length > 0 ? "(↑/↓ + ↵ to pick, or type an answer · esc skip)" : "(type your answer · ↵ submit · esc skip)"}
          </Text>
        )}
      </Box>
    </Box>
  );
}
