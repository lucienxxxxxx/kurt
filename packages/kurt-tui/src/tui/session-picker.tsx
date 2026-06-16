import { Box, Text } from "ink";
import type { SessionMeta } from "kurt-agent";

/** Interactive session list shown by `/sessions`. Keys are handled in App. */
export function SessionPicker({ sessions, selected }: { sessions: SessionMeta[]; selected: number }) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>
        Sessions (this workspace) — ↑/↓ move · ↵ open · d delete · esc close
      </Text>
      {sessions.length === 0 ? (
        <Text dimColor>No saved sessions yet.</Text>
      ) : (
        sessions.map((s, i) => (
          <Text key={s.id} inverse={i === selected} color={i === selected ? undefined : "gray"}>
            {`${(s.title || "(untitled)").padEnd(40).slice(0, 40)}  ${s.messageCount} msg  ·  ${rel(s.updatedAt)}`}
          </Text>
        ))
      )}
    </Box>
  );
}

/** Compact "time ago" label. */
function rel(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
