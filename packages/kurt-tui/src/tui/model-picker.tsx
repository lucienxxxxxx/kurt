import { Box, Text } from "ink";

export interface ModelOption {
  model: string;
  /** The provider that serves this model (e.g. "DeepSeek"), for context. */
  provider: string;
}

/** Interactive model list shown by `/model`. Keys are handled in App. */
export function ModelPicker({ items, selected, current }: { items: ModelOption[]; selected: number; current: string }) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>
        Select model — ↑/↓ move · ↵ choose · esc cancel
      </Text>
      {items.length === 0 ? (
        <Text dimColor>No models available. Configure a provider with /provider first.</Text>
      ) : (
        items.map((it, i) => (
          <Text key={it.model} inverse={i === selected} color={i === selected ? undefined : "gray"}>
            {`${it.model === current ? "● " : "  "}${it.model.padEnd(22).slice(0, 22)}  ${it.provider}`}
          </Text>
        ))
      )}
    </Box>
  );
}
