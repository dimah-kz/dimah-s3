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
  return p.spinner();
}

export function handleCancel(
  value: unknown,
): asserts value is Exclude<typeof value, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    throw new CliError("Cancelled", EXIT_CANCEL);
  }
}

export { p };
