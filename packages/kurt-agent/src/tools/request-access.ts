/**
 * RequestAccessTool — the generalized "ask the user to widen my sandbox" path.
 * One tool, several capability kinds (so adding a capability is +1 kind, not +1
 * tool): `write` a directory, `network` access, or `open` a file/app. Each routes
 * through the same PermissionProvider as risky commands; on approval the grant
 * lasts for the rest of the session.
 *
 * Engine stays zero-I/O: the actual "open" is delegated to an injected `opener`
 * supplied by the composition layer (the bridge), never done here.
 */

import { homedir } from "node:os";
import { resolve } from "node:path";
import type { Tool, ToolContext, ToolResult, ToolSpec } from "../engine/index.ts";
import type { PermissionProvider } from "../permission/types.ts";

/** Session-scoped grants the file/exec tools read live. `dirs` mirrors the run's
 *  writable roots so a grant persists to later runs. */
export interface AccessGrants {
  network: boolean;
  open: boolean;
  /** Directories granted write access this session (seeds each run's roots). */
  dirs: string[];
}

export type AccessKind = "write" | "network" | "open";

export interface RequestAccessOptions {
  permission?: PermissionProvider;
  /** Opens a file/URL in the user's default app (composition-layer I/O). */
  opener?: (target: string) => Promise<void>;
}

export class RequestAccessTool implements Tool {
  readonly spec: ToolSpec = {
    name: "request_access",
    description:
      "Request a capability the sandbox blocks by default; the user approves once, then it lasts " +
      "the session. kind=\"write\" → write to a directory OUTSIDE the workspace (target = abs dir; " +
      "call this when a write was refused, then retry). kind=\"network\" → let shell/run_code reach " +
      "the internet (npm/curl/git). kind=\"open\" → open a file or URL in the user's default app " +
      "(target = abs path or URL; great for delivering results).",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["write", "network", "open"], description: "The capability to request." },
        target: { type: "string", description: "For write: the directory; for open: the file path or URL. (Omit for network.)" },
        reason: { type: "string", description: "Why you need it (shown to the user)." },
        // legacy aliases (old request_write_access shape)
        directory: { type: "string", description: "Alias of target for kind=write." },
        path: { type: "string", description: "Alias of target." },
      },
      required: [],
    },
  };

  /** The run's live writable roots (write grants push here for immediate effect). */
  #writable: string[];
  #grants: AccessGrants;
  #permission: PermissionProvider | undefined;
  #opener: ((target: string) => Promise<void>) | undefined;

  constructor(writable: string[], grants: AccessGrants, opts: RequestAccessOptions = {}) {
    this.#writable = writable;
    this.#grants = grants;
    this.#permission = opts.permission;
    this.#opener = opts.opener;
  }

  async execute(input: unknown, _ctx: ToolContext): Promise<ToolResult> {
    const o = (input ?? {}) as { kind?: unknown; target?: unknown; reason?: unknown; directory?: unknown; path?: unknown };
    const target = [o.target, o.directory, o.path].find((v): v is string => typeof v === "string" && v.length > 0) ?? "";
    // Infer kind: explicit, else a path-bearing call is a write (legacy shape).
    const kind: AccessKind = o.kind === "network" || o.kind === "open" || o.kind === "write" ? o.kind : "write";
    const why = typeof o.reason === "string" && o.reason.length > 0 ? ` — ${o.reason}` : "";
    if (!this.#permission) return { content: "No approver available — cannot grant access.", isError: true };

    if (kind === "network") {
      if (this.#grants.network) return { content: "Network access is already granted." };
      const decision = await this.#permission.request({
        key: "access:network", title: "network access",
        command: "network", explanation: `Allow shell / run_code to use the network${why}.`,
        risk: "The agent could make outbound network requests (download, upload, call APIs).",
      });
      if (decision === "deny") return { content: "Denied: network access was not granted.", isError: true };
      this.#grants.network = true;
      return { content: "Granted network access. shell / run_code can now reach the internet." };
    }

    if (kind === "open") {
      if (target.length === 0) return { content: 'Invalid input: "target" (file path or URL) is required for kind="open".', isError: true };
      const t = looksLikeUrl(target) ? target : resolve(expandHome(target));
      const decision = await this.#permission.request({
        key: `access:open:${t}`, title: "open file / app",
        command: t, explanation: `Open ${t} in the default app${why}.`,
        risk: "This launches an external application on the user's machine.",
      });
      if (decision === "deny") return { content: `Denied: opening ${t} was not approved.`, isError: true };
      this.#grants.open = true;
      if (this.#opener) {
        try { await this.#opener(t); } catch (err) { return { content: `Approved but failed to open ${t}: ${err instanceof Error ? err.message : String(err)}`, isError: true }; }
        return { content: `Opened ${t}.` };
      }
      return { content: `Approved opening ${t} (no opener wired).` };
    }

    // kind === "write"
    if (target.length === 0) return { content: 'Invalid input: "target" (or "directory") must be a non-empty directory path for kind="write".', isError: true };
    const dir = resolve(expandHome(target));
    if (this.#writable.includes(dir)) return { content: `Already writable: ${dir}` };
    const decision = await this.#permission.request({
      key: `access:write:${dir}`, title: "write access — outside workspace",
      command: dir, explanation: `Grant write access to ${dir}${why}.`,
      risk: "The agent could create or overwrite files here, outside the sandboxed workspace.",
    });
    if (decision === "deny") return { content: `Denied: write access to ${dir} was not granted.`, isError: true };
    this.#writable.push(dir);                       // this run, live
    if (!this.#grants.dirs.includes(dir)) this.#grants.dirs.push(dir); // persist for later runs
    return { content: `Granted write access to ${dir}. You can now write files there.` };
  }
}

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return homedir() + p.slice(1);
  return p;
}
function looksLikeUrl(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
}
