import { builtinModules } from "node:module";

import { CliError } from "./errors.js";

const INVALID_CHARS = /[^\w.-]+/g;
/** npm's limit for a package name. */
const MAX_NAME_LENGTH = 214;
/** Names npm refuses for every package. */
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "node_modules",
  "favicon.ico",
]);
/** An unscoped npm name: lowercase, URL-safe, starting with a letter or digit. */
const PACKAGE_NAME = /^[a-z\d][a-z\d._-]*$/;

/**
 * Turns a path or directory fragment into an npm package name: its last
 * segment, lowercased, with every run of other characters replaced by `-`.
 * Returns `""` when nothing usable is left, such as for a name with no
 * ASCII letter or digit.
 */
export function sanitizeProjectName(input: string): string {
  const base =
    input.trim().replaceAll("\\", "/").split("/").findLast(Boolean) ?? "";
  const lowered = base.toLowerCase().replaceAll(INVALID_CHARS, "-");
  return lowered.replaceAll(/^[-._]+|[-._]+$/g, "");
}

/** Why `name` cannot be a new npm package, or `undefined` when it can. */
function packageNameProblem(name: string): string | undefined {
  if (name.length === 0) return "the name is empty";
  if (name.length > MAX_NAME_LENGTH) {
    return `the name is longer than ${MAX_NAME_LENGTH} characters`;
  }
  if (!PACKAGE_NAME.test(name)) {
    return "use lowercase letters, digits, dots, dashes and underscores, starting with a letter or a digit";
  }
  if (RESERVED_NAMES.has(name)) return "the name is reserved by npm";
  if (builtinModules.includes(name)) {
    return "it is the name of a Node.js core module";
  }
  return undefined;
}

export function assertValidPackageName(name: string): void {
  const problem = packageNameProblem(name);
  if (problem) {
    throw new CliError(`Invalid package name "${name}": ${problem}`);
  }
}

/**
 * Checks the package name taken from a project directory. `directory` is
 * what the user typed or the folder it resolved to. A directory with no
 * usable character fails here: `create` never invents a name.
 */
export function assertProjectName(name: string, directory: string): void {
  if (name === "") {
    throw new CliError(
      `"${directory}" has no ASCII letter or digit, so it cannot name the package. Choose another directory name.`,
    );
  }
  assertValidPackageName(name);
}
