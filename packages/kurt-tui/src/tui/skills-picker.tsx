import { Box, Text } from "ink";
import type { SkillInfo } from "../skills.ts";

/** Interactive skills list shown by `/skills`. Keys are handled in App. */
export function SkillsPicker({ skills, selected }: { skills: SkillInfo[]; selected: number }) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="magenta" bold>
        Skills (global + project) — ↑/↓ move · ↵ view · esc close
      </Text>
      {skills.length === 0 ? (
        <Text dimColor>No skills loaded. Drop one in ~/.kurt/skills/ or {"<workspace>"}/.kurt/skills/.</Text>
      ) : (
        skills.map((s, i) => (
          <Text key={s.name} inverse={i === selected} color={i === selected ? undefined : "gray"}>
            {`${(s.name || "(unnamed)").padEnd(24).slice(0, 24)}  ${badge(s.scope)}  ${s.description}`}
          </Text>
        ))
      )}
    </Box>
  );
}

function badge(scope: SkillInfo["scope"]): string {
  return scope === "project" ? "[project]" : "[global] ";
}
