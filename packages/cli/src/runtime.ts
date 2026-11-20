import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";

import { CliError } from "./utils/errors.js";

/** The `engines.node` floor of every published `@dimah-s3/*` package. */
const MIN_NODE_MAJOR = 22;

/**
 * Package root, one level up from both `src/runtime.ts` and the bundled
 * `dist/index.js`, so the version resolves the same way in tests and in the
 * published tarball.
 */
function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

let cachedVersion: string | undefined;

export function cliVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot(), "package.json"), "utf8"),
    ) as { version?: string };
    cachedVersion = pkg.version ?? "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}

export function assertSupportedNode(version = process.versions.node): void {
  const major = Number(version.split(".")[0]);
  if (major >= MIN_NODE_MAJOR) return;

  throw new CliError(
    `Node.js ${MIN_NODE_MAJOR} or newer is required (running ${version}).`,
  );
}
