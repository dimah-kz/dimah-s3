import type { ArgsDef } from "citty";

import { CliError } from "./errors.js";

type FlagKind = "boolean" | "string";

function camelCase(name: string): string {
  return name.replaceAll(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
}

function unknownOption(token: string): CliError {
  return new CliError(
    `Unknown option "${token}". Run with --help to list the options.`,
  );
}

/**
 * Rejects what the argument parser would accept in silence: an option the
 * command does not declare, and more positionals than it takes. Without
 * this, `create --templte vite my-app` scaffolds the default template into
 * `./vite`.
 *
 * `rawArgs` are the tokens after the command name. A `--no-` prefix is
 * accepted on boolean options only.
 */
export function assertKnownArgs(
  rawArgs: readonly string[],
  argsDef: ArgsDef,
): void {
  const flags = new Map<string, FlagKind>();
  let positionalCount = 0;
  for (const [name, def] of Object.entries(argsDef)) {
    if (def.type === "positional") {
      positionalCount += 1;
      continue;
    }
    const kind: FlagKind = def.type === "boolean" ? "boolean" : "string";
    const alias = "alias" in def ? def.alias : undefined;
    const aliases =
      alias === undefined ? [] : Array.isArray(alias) ? alias : [alias];
    for (const key of [name, camelCase(name), ...aliases]) flags.set(key, kind);
  }

  const positionals: string[] = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const token = rawArgs[index] ?? "";
    if (token === "--") {
      positionals.push(...rawArgs.slice(index + 1));
      break;
    }

    if (token.startsWith("--")) {
      const equals = token.indexOf("=");
      const name = token.slice(2, equals === -1 ? undefined : equals);
      const negated =
        name.startsWith("no-") && flags.get(name.slice(3)) === "boolean";
      const kind = negated ? "boolean" : flags.get(name);
      if (kind === undefined) throw unknownOption(token);
      // `--template vite`: the next token is the value, not a positional.
      if (kind === "string" && equals === -1) index += 1;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      const letters = token.slice(1);
      for (let at = 0; at < letters.length; at += 1) {
        const kind = flags.get(letters.charAt(at));
        if (kind === undefined) throw unknownOption(token);
        if (kind === "string") {
          // `-t vite` takes the next token; `-tvite` carries its value.
          if (at === letters.length - 1) index += 1;
          break;
        }
      }
      continue;
    }

    positionals.push(token);
  }

  const extra = positionals[positionalCount];
  if (extra !== undefined) {
    throw new CliError(
      `Unexpected argument "${extra}". Pass one project directory, and put option values right after their option.`,
    );
  }
}
