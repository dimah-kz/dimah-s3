import validateNpmPackageName from "validate-npm-package-name";

import { CliError } from "./errors.js";

const INVALID_CHARS = /[^\w.-]+/g;

/** Turn a path/dir fragment into a reasonable npm package name. */
export function sanitizeProjectName(input: string): string {
  const base =
    input.trim().replaceAll("\\", "/").split("/").findLast(Boolean) ?? "";
  const lowered = base.toLowerCase().replaceAll(INVALID_CHARS, "-");
  const trimmed = lowered.replaceAll(/^[-._]+|[-._]+$/g, "");
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
