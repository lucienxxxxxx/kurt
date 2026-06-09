/**
 * Rule-based classifier for risky shell commands. Pure + deterministic (no model
 * call): returns the matched risk (with a whitelist `key`, explanation, and the
 * concrete danger) or null when the command needs no approval.
 */

export interface CommandRisk {
  key: string;
  title: string;
  explanation: string;
  risk: string;
}

interface Rule extends Omit<CommandRisk, "command"> {
  test: RegExp;
}

// More specific patterns first; first match wins. `key` groups commands for the
// "always allow" whitelist (allowing "rm" once allows all rm in that project).
const RULES: Rule[] = [
  {
    key: "fork-bomb",
    title: "fork bomb",
    test: /:\s*\(\s*\)\s*\{[^}]*\|[^}]*&\s*\}\s*;\s*:/,
    explanation: "A shell fork bomb that spawns processes until the machine is exhausted.",
    risk: "Freezes/crashes the machine.",
  },
  {
    key: "pipe-to-shell",
    title: "download piped to a shell",
    test: /\b(curl|wget|fetch)\b[^\n|]*\|\s*(sudo\s+)?(sh|bash|zsh|fish)\b/,
    explanation: "Downloads a remote script and executes it immediately.",
    risk: "Runs untrusted remote code with your privileges.",
  },
  {
    key: "disk",
    title: "raw disk / filesystem write",
    test: /\b(mkfs\w*|dd|fdisk|diskutil|parted)\b|>\s*\/dev\/(disk|sd|rdisk)/,
    explanation: "Writes to raw disks or formats a filesystem.",
    risk: "Can destroy entire disks/volumes irreversibly.",
  },
  {
    key: "sudo",
    title: "sudo — run as root",
    test: /\bsudo\b|\bdoas\b/,
    explanation: "Runs a command with elevated (root) privileges, bypassing the sandbox's intent.",
    risk: "Full-system changes outside the workspace.",
  },
  {
    key: "power",
    title: "shutdown / reboot",
    test: /\b(shutdown|reboot|halt|poweroff)\b/,
    explanation: "Powers off or restarts the machine.",
    risk: "Ends your session / loses unsaved work.",
  },
  {
    key: "rm",
    title: "rm — delete files",
    test: /\brm\b/,
    explanation: "Deletes files or directories (recursively/forced if flagged).",
    risk: "Irreversible data loss.",
  },
  {
    key: "chmod-chown",
    title: "broad permission/ownership change",
    test: /\bchmod\s+(-R\s+)?0?777\b|\bchmod\s+-R\b|\bchown\s+-R\b/,
    explanation: "Changes permissions/ownership broadly (recursive or world-writable).",
    risk: "Can break or expose files across the tree.",
  },
  {
    key: "kill",
    title: "force-kill processes",
    test: /\bkill\s+-9\b|\bkillall\b|\bpkill\b/,
    explanation: "Force-terminates processes by signal/name.",
    risk: "Can kill unrelated processes and lose their state.",
  },
  {
    key: "git-destruct",
    title: "destructive git",
    test: /\bgit\s+push\b[^\n]*(--force\b|-f\b|\+)|\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-[a-z]*f/,
    explanation: "Force-push, hard reset, or force-clean — rewrites/discards work.",
    risk: "Loses commits or local changes irreversibly.",
  },
];

export function classifyCommand(command: string): CommandRisk | null {
  for (const r of RULES) {
    if (r.test.test(command)) {
      return { key: r.key, title: r.title, explanation: r.explanation, risk: r.risk };
    }
  }
  return null;
}
