import type { CreateContext } from "@/types";
import { cancelledError } from "@/utils/cancel";
import { CliError, errorMessage } from "@/utils/errors";
import { isInteractive, logInfo, logWarn, spinner } from "@/utils/ui";

/** Updates the running spinner text of the current step. */
export type StepReport = (message: string) => void;

export type CreateStep = {
  /** Stable id used in error messages and tests. */
  id: string;
  title: string | ((ctx: CreateContext) => string);
  /** Skipped entirely when this returns false. */
  enabled?: (ctx: CreateContext) => boolean;
  /**
   * Failure warns and continues instead of aborting the run. Use it for steps
   * that leave a usable project behind (dependency install, git init).
   */
  recoverable?: boolean;
  /**
   * Resolves to the completed-step message, or undefined to keep the title.
   * `signal` aborts when the user cancels: stop child processes on it. The
   * runner ends the run after the step returns or throws.
   */
  run: (
    ctx: CreateContext,
    report: StepReport,
    signal: AbortSignal,
  ) => Promise<string | void>;
};

type StepReporter = {
  start: (title: string) => void;
  update: StepReport;
  finish: (message: string, outcome?: "done" | "cancelled" | "failed") => void;
};

/**
 * Animated spinners repaint on every frame when stdout is not a TTY, which
 * floods CI logs — plain lines are used there instead.
 */
function createReporter(): StepReporter {
  if (!isInteractive()) {
    return {
      start: (title) => logInfo(title),
      update: () => {},
      finish: (message) => logInfo(message),
    };
  }

  const s = spinner();
  return {
    start: (title) => s.start(title),
    update: (message) => s.message(message),
    finish: (message, outcome) => s.stop(message, outcome),
  };
}

function stepTitle(step: CreateStep, ctx: CreateContext): string {
  return typeof step.title === "function" ? step.title(ctx) : step.title;
}

/**
 * Runs steps in order, one reporter each, and reports the ids of recoverable
 * steps that failed. Clack's `tasks()` helper is deliberately avoided: it
 * leaves the spinner interval running when a task throws, hanging the process.
 *
 * Once `signal` aborts, the running step is the last one: the run rejects
 * with a cancel `CliError` (exit code 130), also when that step is
 * recoverable or finished anyway.
 */
export async function runSteps(
  steps: CreateStep[],
  ctx: CreateContext,
  signal: AbortSignal = new AbortController().signal,
): Promise<{ failedSteps: string[] }> {
  const failedSteps: string[] = [];

  for (const step of steps) {
    if (step.enabled && !step.enabled(ctx)) continue;
    if (signal.aborted) throw cancelledError();

    const title = stepTitle(step, ctx);
    const reporter = createReporter();
    reporter.start(title);

    let done: string | void;
    try {
      done = await step.run(ctx, reporter.update, signal);
    } catch (error) {
      if (signal.aborted) {
        reporter.finish(`${title} — cancelled`, "cancelled");
        throw cancelledError();
      }
      reporter.finish(`${title} — failed`, "failed");
      if (step.recoverable) {
        logWarn(errorMessage(error));
        failedSteps.push(step.id);
        continue;
      }
      throw error instanceof CliError
        ? error
        : new CliError(`${step.id}: ${errorMessage(error)}`, undefined, {
            cause: error,
          });
    }

    if (signal.aborted) {
      reporter.finish(`${title} — cancelled`, "cancelled");
      throw cancelledError();
    }
    reporter.finish(done || title);
  }

  return { failedSteps };
}
