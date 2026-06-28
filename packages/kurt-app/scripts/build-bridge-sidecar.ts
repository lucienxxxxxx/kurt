import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function rustHostTriple(): string {
  const proc = Bun.spawnSync(["rustc", "-vV"], { stdout: "pipe", stderr: "pipe" });
  if (!proc.success) {
    throw new Error(`failed to run rustc -vV: ${proc.stderr.toString()}`);
  }

  const host = proc.stdout
    .toString()
    .split("\n")
    .find((line) => line.startsWith("host: "))
    ?.slice("host: ".length)
    .trim();

  if (!host) {
    throw new Error("could not read host target triple from rustc -vV");
  }

  return host;
}

const repoRoot = resolve(import.meta.dir, "../../..");
const targetTriple = process.env.TAURI_TARGET_TRIPLE ?? process.env.CARGO_BUILD_TARGET ?? rustHostTriple();
const extension = targetTriple.includes("windows") ? ".exe" : "";
const output = resolve(repoRoot, "packages/kurt-app/src-tauri/binaries", `kurt-bridge-${targetTriple}${extension}`);

mkdirSync(dirname(output), { recursive: true });

const build = Bun.spawnSync(
  ["bun", "build", "packages/kurt-bridge/src/index.ts", "--compile", "--outfile", output],
  {
    cwd: repoRoot,
    stdout: "inherit",
    stderr: "inherit",
  },
);

if (!build.success) {
  process.exit(build.exitCode || 1);
}

chmodSync(output, 0o755);
console.log(`built kurt-bridge sidecar: ${output}`);
