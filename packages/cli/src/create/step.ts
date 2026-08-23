import type { CreateContext } from "@/types";
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
  /** Resolves to the completed-step message, or undefined to keep the title. */
  run: (ctx: CreateContext, report: StepReport) => Promise<string | void>;
};

type StepReporter = {
  start: (title: string) => void;
  update: StepReport;
  finish: (message: string) => void;
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
    finish: (message) => s.stop(message),
  };
}

function stepTitle(step: CreateStep, ctx: CreateContext): string {
  return typeof step.title === "function" ? step.title(ctx) : step.title;
}

/**
 * Runs steps in order, one reporter each, and reports the ids of recoverable
 * steps that failed. Clack's `tasks()` helper is deliberately avoided: it
 * leaves the spinner interval running when a task throws, hanging the process.
 */
export async function runSteps(
  steps: CreateStep[],
  ctx: CreateContext,
): Promise<{ failedSteps: string[] }> {
  const failedSteps: string[] = [];

  for (const step of steps) {
    if (step.enabled && !step.enabled(ctx)) continue;

    const title = stepTitle(step, ctx);
    const reporter = createReporter();
    reporter.start(title);

    try {
      const done = await step.run(ctx, reporter.update);
      reporter.finish(done || title);
    } catch (error) {
      reporter.finish(`${title} — failed`);
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
  }

  return { failedSteps };
}
