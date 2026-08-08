import validateNpmPackageName from "validate-npm-package-name";

import { CliError } from "./errors.js";

const INVALID_CHARS = /[^a-z0-9._-]+/gi;

/** Turn a path/dir fragment into a reasonable npm package name. */
export function sanitizeProjectName(input: string): string {
  const base =
    input.trim().replace(/\\/g, "/").split("/").filter(Boolean).at(-1) ?? "";
  const lowered = base.toLowerCase().replace(INVALID_CHARS, "-");
  const trimmed = lowered.replace(/^[-._]+|[-._]+$/g, "");
  return trimmed || "my-app";
}

export function assertValidPackageName(name: string): void {
  const result = validateNpmPackageName(name);
  if (result.validForNewPackages) return;

  const problems = [...(result.errors ?? []), ...(result.warnings ?? [])];
  throw new CliError(
    `Invalid package name "${name}"${problems.length ? `: ${problems.join("; ")}` : ""}`,
  );
}
