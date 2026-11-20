import { CliError, EXIT_CANCEL } from "./errors.js";

export type CancelListener = {
  /** Aborts on the first Ctrl+C (SIGINT) or SIGTERM. */
  signal: AbortSignal;
  /** Stops listening. Call it once the work has ended. */
  dispose: () => void;
};

/**
 * Turns the first SIGINT or SIGTERM into an aborted signal, so the caller
 * can stop its work, undo it and exit with code 130. Each listener runs
 * once: a second Ctrl+C ends the process at once, the default way.
 */
export function listenForCancel(): CancelListener {
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  return {
    signal: controller.signal,
    dispose() {
      process.off("SIGINT", abort);
      process.off("SIGTERM", abort);
    },
  };
}

/** The error of a run the user stopped. It exits with code 130. */
export function cancelledError(): CliError {
  return new CliError("Cancelled", EXIT_CANCEL);
}

export function isCancelledError(error: unknown): boolean {
  return error instanceof CliError && error.exitCode === EXIT_CANCEL;
}

/** Throws {@link cancelledError} once `signal` has aborted. */
export function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) throw cancelledError();
}
