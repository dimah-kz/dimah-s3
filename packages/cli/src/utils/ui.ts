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

/** Errors go to stderr, so a piped stdout stays clean. */
export function logError(message: string) {
  p.log.error(message, { output: process.stderr });
}

/** The closing line of a run the user stopped. */
export function cancel(message: string) {
  p.cancel(message);
}

export type Spinner = {
  start: (message: string) => void;
  message: (message: string) => void;
  /** Ends the spinner with a done, cancelled or failed mark. */
  stop: (message: string, outcome?: "done" | "cancelled" | "failed") => void;
};

const SPINNER_FRAMES = p.unicode ? ["◒", "◐", "◓", "◑"] : ["•", "o", "O", "0"];
const SPINNER_DELAY_MS = p.unicode ? 80 : 120;

function elapsed(since: number): string {
  const seconds = Math.floor((Date.now() - since) / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `[${minutes}m ${seconds % 60}s]` : `[${seconds}s]`;
}

/**
 * A step spinner that leaves stdin alone.
 *
 * Clack's own spinner puts stdin in raw mode and ends the process with exit
 * code 0 when Ctrl+C arrives, which would skip the rollback and leave the
 * package manager running. This one only draws, so Ctrl+C stays a SIGINT
 * that the create pipeline handles.
 */
export function spinner(): Spinner {
  const out = process.stdout;
  let timer: NodeJS.Timeout | undefined;
  let text = "";
  let frame = 0;
  let startedAt = 0;

  // One line only: a wrapped line could not be redrawn in place.
  const fit = (line: string) => {
    const width = (out.columns || 80) - 12;
    return line.length > width ? `${line.slice(0, width - 1)}…` : line;
  };
  const clearLine = () => out.write("\r\u001B[2K");
  const render = () => {
    const mark = pc.magenta(SPINNER_FRAMES[frame++ % SPINNER_FRAMES.length]);
    clearLine();
    out.write(`${mark}  ${fit(text)} ${pc.dim(elapsed(startedAt))}`);
  };

  return {
    start(message) {
      text = message;
      startedAt = Date.now();
      out.write(`${pc.gray(p.S_BAR)}\n`);
      render();
      timer = setInterval(render, SPINNER_DELAY_MS);
    },
    message(message) {
      text = message;
    },
    stop(message, outcome = "done") {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
      const mark =
        outcome === "done"
          ? pc.green(p.S_STEP_SUBMIT)
          : outcome === "cancelled"
            ? pc.red(p.S_STEP_CANCEL)
            : pc.red(p.S_STEP_ERROR);
      clearLine();
      out.write(`${mark}  ${message} ${pc.dim(elapsed(startedAt))}\n`);
    },
  };
}

/** Prompts need a real TTY on both ends — CI and piped input get defaults. */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Await a Clack prompt and turn cancellation (Ctrl+C) into a `CliError` so the
 * caller never has to narrow `CANCEL_SYMBOL` out of the result.
 */
export async function ask<T>(
  prompt: Promise<T | typeof p.CANCEL_SYMBOL>,
): Promise<T> {
  const value = await prompt;
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    throw new CliError("Cancelled", EXIT_CANCEL);
  }
  return value;
}

export { p };
