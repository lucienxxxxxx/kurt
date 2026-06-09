import { Box, Text } from "ink";
import type { PermissionRequest } from "kurt-agent";

/** The approval prompt shown while a sensitive command awaits the user. */
export function Approval({ req }: { req: PermissionRequest }) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>
        ⚠ Permission needed — {req.title}
      </Text>
      <Text>{`$ ${req.command}`}</Text>
      <Text dimColor>{req.explanation}</Text>
      <Text color="red">{`risk: ${req.risk}`}</Text>
      <Box marginTop={1}>
        <Text color="green">[y]</Text>
        <Text> allow once   </Text>
        <Text color="cyan">[a]</Text>
        <Text> always allow (this project)   </Text>
        <Text color="red">[n / esc]</Text>
        <Text> deny</Text>
      </Box>
    </Box>
  );
}
