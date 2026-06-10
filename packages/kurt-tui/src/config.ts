/**
 * Persisted user config — so the settings you pick (model / effort / thinking /
 * mode, …) survive across launches instead of resetting every time.
 *
 * Stored at ~/.kurt/config.json (override with KURT_CONFIG_PATH, used by tests).
 * The API key is NEVER persisted here — it stays in the environment.
 */

import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { kurtHome } from "./paths.ts";

export interface PersistedConfig {
  model?: string;
  baseURL?: string;
  context?: number;
  maxTokens?: number;
  effort?: string;
  thinking?: boolean;
  mode?: "ask" | "agent" | "plan";
}

const PERSIST_KEYS: (keyof PersistedConfig)[] = ["model", "baseURL", "context", "maxTokens", "effort", "thinking", "mode"];

export function configPath(): string {
  return process.env.KURT_CONFIG_PATH ?? join(kurtHome(), "config.json");
}

export async function loadConfig(): Promise<PersistedConfig> {
  try {
    const file = Bun.file(configPath());
    if (!(await file.exists())) return {};
    return sanitize((await file.json()) as Record<string, unknown>);
  } catch {
    return {}; // corrupt/unreadable → behave as if unset
  }
}

/** Merge a patch into the saved config and write it back. */
export async function saveConfig(patch: PersistedConfig): Promise<void> {
  const next = { ...(await loadConfig()), ...sanitize(patch as Record<string, unknown>) };
  await mkdir(dirname(configPath()), { recursive: true });
  await Bun.write(configPath(), JSON.stringify(next, null, 2) + "\n");
}

/** Keep only known keys (ignore junk / stale fields). Exported for tests. */
export function sanitize(raw: Record<string, unknown>): PersistedConfig {
  const out: PersistedConfig = {};
  for (const key of PERSIST_KEYS) {
    if (raw[key] !== undefined) (out as Record<string, unknown>)[key] = raw[key];
  }
  return out;
}
