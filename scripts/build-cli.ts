import { chmodSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

function targetName(): string {
  const os = process.platform;
  const arch = process.arch;

  const platform =
    os === "darwin" ? "darwin" :
    os === "linux" ? "linux" :
    os === "win32" ? "windows" :
    os;

  const cpu =
    arch === "arm64" ? "arm64" :
    arch === "x64" ? "x64" :
    arch;

  const ext = platform === "windows" ? ".exe" : "";
  return `kurt-${platform}-${cpu}${ext}`;
}

const repoRoot = resolve(import.meta.dir, "..");
const outDir = resolve(repoRoot, "dist");
const outFile = resolve(outDir, targetName());

mkdirSync(outDir, { recursive: true });

const build = Bun.spawnSync(
  ["bun", "build", "packages/kurt-tui/src/cli.ts", "--compile", "--outfile", outFile],
  {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  },
);

if (!build.success) {
  process.exit(build.exitCode || 1);
}

if (process.platform !== "win32") chmodSync(outFile, 0o755);
console.log(`built kurt CLI: ${outFile}`);
