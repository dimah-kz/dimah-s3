import { CliError, EXIT_CANCEL, EXIT_ERROR, errorMessage } from "./errors.js";
import { logError } from "./ui.js";

/**
 * Single error boundary for command bodies. Expected failures print one styled
 * line; unexpected ones also print a stack so they can be reported. Exit codes
 * are set instead of calling `process.exit`, which can truncate stdout.
 */
export async function withErrorBoundary(
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof CliError) {
      if (error.exitCode !== EXIT_CANCEL) {
        logError(error.message);
      }
      process.exitCode = error.exitCode;
      return;
    }

    logError(errorMessage(error));
    if (error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`);
    }
    process.exitCode = EXIT_ERROR;
  }
}
