import { Box, Text } from "ink";
import type { ProviderId, ResolvedProvider, WireFormat } from "../providers.ts";

/** Editable fields in the per-provider form (format only applies to custom). */
export type ProvField = "apiKey" | "baseURL" | "models" | "format";

export function editFields(custom: boolean): ProvField[] {
  return custom ? ["apiKey", "baseURL", "models", "format"] : ["apiKey", "baseURL", "models"];
}

/** Draft state while editing one provider (owned by App, rendered here). */
export interface ProvEdit {
  id: ProviderId;
  label: string;
  custom: boolean;
  field: number; // index into editFields(custom)
  apiKey: string;
  baseURL: string;
  models: string; // comma-separated draft
  format: WireFormat;
}

const FIELD_LABEL: Record<ProvField, string> = {
  apiKey: "API key",
  baseURL: "Base URL",
  models: "Models (comma-separated)",
  format: "Wire format",
};

/** Provider setup overlay: a list of providers, or the edit form for one. */
export function ProviderConfigView({
  rows,
  selected,
  edit,
}: {
  rows: ResolvedProvider[];
  selected: number;
  edit: ProvEdit | null;
}) {
  if (edit) return <EditForm edit={edit} />;
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="green" paddingX={1}>
      <Text color="green" bold>
        Providers — ↑/↓ move · space enable/disable · ↵ edit · esc close
      </Text>
      {rows.map((p, i) => (
        <Text key={p.id} inverse={i === selected} color={i === selected ? undefined : "gray"}>
          {`${p.enabled ? "[x]" : "[ ]"} ${p.label.padEnd(9).slice(0, 9)}  ${p.apiKey ? "key:set " : "key:none"}  ${p.models.length ? p.models.join(",") : "(no models)"}`}
        </Text>
      ))}
    </Box>
  );
}

function EditForm({ edit }: { edit: ProvEdit }) {
  const fields = editFields(edit.custom);
  const value = (f: ProvField): string => {
    if (f === "apiKey") return mask(edit.apiKey);
    if (f === "baseURL") return edit.baseURL || (edit.custom ? "(e.g. https://api.example.com/v1)" : "(default)");
    if (f === "models") return edit.models || "(provider defaults)";
    return edit.format;
  };
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="green" paddingX={1}>
      <Text color="green" bold>
        Edit {edit.label} — Tab/↑↓ field · type to edit · {edit.custom ? "←/→ toggles format · " : ""}↵ save · esc cancel
      </Text>
      {fields.map((f, i) => (
        <Text key={f} inverse={i === edit.field} color={i === edit.field ? undefined : "gray"}>
          {`${FIELD_LABEL[f].padEnd(26)} ${value(f)}`}
        </Text>
      ))}
    </Box>
  );
}

/** Mask an API key for display (keep the last 4 chars). */
function mask(key: string): string {
  if (!key) return "(none)";
  return key.length <= 4 ? "••••" : "••••" + key.slice(-4);
}
