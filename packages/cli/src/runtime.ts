import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";

import { CliError } from "./utils/errors.js";

const MIN_NODE = { major: 20, minor: 19 };

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
  const [major = 0, minor = 0] = version.split(".").map(Number);
  const supported =
    major > MIN_NODE.major ||
    (major === MIN_NODE.major && minor >= MIN_NODE.minor);
  if (supported) return;

  throw new CliError(
    `Node.js ${MIN_NODE.major}.${MIN_NODE.minor} or newer is required (running ${version}).`,
  );
}
