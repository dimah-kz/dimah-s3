import * as p from "@clack/prompts";
import pc from "picocolors";

import { CliError, EXIT_CANCEL } from "./errors.js";

export function intro(message = "dimah-s3") {
  p.intro(pc.bgCyan(pc.black(` ${message} `)));
}

export function outro(message: string) {
  p.outro(message);
}

export function note(message: string, title?: string) {
  p.note(message, title);
}

export function logInfo(message: string) {
  p.log.info(message);
}

export function logWarn(message: string) {
  p.log.warn(message);
}

export function logError(message: string) {
  p.log.error(message);
}

export function spinner() {
  return p.spinner({ indicator: "timer" });
}

/** Prompts need a real TTY on both ends — CI and piped input get defaults. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Await a Clack prompt and turn cancellation (Ctrl+C) into a `CliError` so the
 * caller never has to narrow the cancel symbol out of the result.
 */
export async function ask<T>(prompt: Promise<T | symbol>): Promise<T> {
  const value = await prompt;
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    throw new CliError("Cancelled", EXIT_CANCEL);
  }
  return value as T;
}

export { p };
