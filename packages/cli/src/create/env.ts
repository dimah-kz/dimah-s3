import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "pathe";

import { pathExists } from "@/utils/fs";

/** Keys `create` writes a fresh value for in `.env`. */
export const GENERATED_ENV_KEYS = ["DIMAH_S3_SECRET"] as const;

export type GeneratedEnvKey = (typeof GENERATED_ENV_KEYS)[number];

/** Upload ticket secret: 32 random bytes, base64 (44 characters). */
export function generateSecret(): string {
  return randomBytes(32).toString("base64");
}

const GENERATORS: Record<GeneratedEnvKey, () => string> = {
  DIMAH_S3_SECRET: generateSecret,
};

export type FillGeneratedEnvOptions = {
  /**
   * Keep a value that is already set (default true). Pass false when the
   * content comes from `.env.example`, whose values are only placeholders.
   */
  keepSet?: boolean;
  /** Value for a key (default: a fresh random value). */
  generate?: (key: GeneratedEnvKey) => string;
};

export type FillGeneratedEnvResult = {
  content: string;
  /** Keys that received a new value, in `GENERATED_ENV_KEYS` order. */
  generated: GeneratedEnvKey[];
};

function assignmentPattern(key: string): RegExp {
  return new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=)(.*)$`);
}

/** Value of a dotenv assignment, without quotes or a trailing comment. */
function parseValue(raw: string): string {
  const value = raw.trim();
  const quote = value[0];
  if (quote === '"' || quote === "'" || quote === "`") {
    const end = value.indexOf(quote, 1);
    return end === -1 ? value.slice(1) : value.slice(1, end);
  }
  return value.replace(/(^|\s)#.*$/, "").trim();
}

function appendLines(content: string, lines: string[]): string {
  if (lines.length === 0) return content;
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const base =
    content === "" || content.endsWith("\n") ? content : content + eol;
  return base + lines.map((line) => line + eol).join("");
}

/** Index and match of the first assignment of `key`, ignoring a trailing CR. */
function findAssignment(
  lines: string[],
  key: string,
): { index: number; match: RegExpExecArray; cr: string } | undefined {
  const pattern = assignmentPattern(key);
  for (const [index, line] of lines.entries()) {
    const cr = line.endsWith("\r") ? "\r" : "";
    const match = pattern.exec(cr ? line.slice(0, -1) : line);
    if (match) return { index, match, cr };
  }
  return undefined;
}

/**
 * Gives every generated key a value. An existing assignment is filled in
 * place and a missing key is appended. A key that already has a value is kept
 * unless `keepSet` is false.
 */
export function fillGeneratedEnv(
  content: string,
  options: FillGeneratedEnvOptions = {},
): FillGeneratedEnvResult {
  const { keepSet = true, generate = (key) => GENERATORS[key]() } = options;
  const lines = content.split("\n");
  const generated: GeneratedEnvKey[] = [];
  const appended: string[] = [];

  for (const key of GENERATED_ENV_KEYS) {
    const found = findAssignment(lines, key);
    if (!found) {
      appended.push(`${key}="${generate(key)}"`);
      generated.push(key);
      continue;
    }

    const { index, match, cr } = found;
    if (keepSet && parseValue(match[2] ?? "") !== "") continue;
    lines[index] = `${match[1]}"${generate(key)}"${cr}`;
    generated.push(key);
  }

  return { content: appendLines(lines.join("\n"), appended), generated };
}

/** Appends an empty `KEY=""` line for each generated key that is not listed. */
export function addGeneratedEnvPlaceholders(content: string): string {
  const lines = content.split("\n");
  const missing = GENERATED_ENV_KEYS.filter(
    (key) => !findAssignment(lines, key),
  );
  return appendLines(
    content,
    missing.map((key) => `${key}=""`),
  );
}

async function readText(path: string): Promise<string | undefined> {
  if (!(await pathExists(path))) return undefined;
  return readFile(path, "utf8");
}

/**
 * Writes `.env` for a scaffolded project. A new `.env` starts from
 * `.env.example`, and every generated key gets a fresh value. An existing
 * `.env` keeps its set values and only gains the keys it lacks or has empty.
 * `.env.example` gets an empty placeholder for any generated key it does not
 * list. Resolves to the keys that received a new value.
 */
export async function writeProjectEnv(
  targetDir: string,
): Promise<GeneratedEnvKey[]> {
  const examplePath = join(targetDir, ".env.example");
  const envPath = join(targetDir, ".env");

  const example = await readText(examplePath);
  if (example !== undefined) {
    const withPlaceholders = addGeneratedEnvPlaceholders(example);
    if (withPlaceholders !== example) {
      await writeFile(examplePath, withPlaceholders, "utf8");
    }
  }

  const existing = await readText(envPath);
  const { content, generated } = fillGeneratedEnv(existing ?? example ?? "", {
    keepSet: existing !== undefined,
  });
  if (content !== existing) {
    await writeFile(envPath, content, "utf8");
  }
  return generated;
}
