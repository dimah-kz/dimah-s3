import { relative } from "pathe";
import pc from "picocolors";

import type { CreateContext } from "../types.js";
import { removeDir } from "../utils/fs.js";
import { installCommand, runDevCommand } from "../utils/package-manager.js";
import { logWarn, note, outro } from "../utils/ui.js";
import type { ResolvedCreate } from "./config.js";
import type { CreateStep } from "./step.js";
import { runSteps } from "./step.js";
import { installStep } from "./steps/install-deps.js";
import { initGitStep } from "./steps/init-git.js";
import { scaffoldStep } from "./steps/scaffold.js";

const DOCS_URL = "https://dimah-s3.vercel.app";

/**
 * Ordered create steps. New options (extra plugins, opt-in features) are added
 * as steps here — everything they need is on the context.
 */
export const createSteps: CreateStep[] = [
  scaffoldStep,
  installStep,
  initGitStep,
];

export type CreateResult = {
  /** Recoverable steps that failed — the project exists but needs manual work. */
  failedSteps: string[];
};

export async function runCreatePipeline({
  config,
  template,
}: ResolvedCreate): Promise<CreateResult> {
  const ctx: CreateContext = {
    config,
    template: template.meta,
    templateDir: template.dir,
    cwd: process.cwd(),
    createdTargetDir: false,
    installed: false,
  };

  let failedSteps: string[];
  try {
    ({ failedSteps } = await runSteps(createSteps, ctx));
  } catch (error) {
    await rollback(ctx);
    throw error;
  }

  printNextSteps(ctx);
  return { failedSteps };
}

/** Only removes a directory this run created, never pre-existing content. */
async function rollback(ctx: CreateContext): Promise<void> {
  if (!ctx.createdTargetDir) return;
  try {
    await removeDir(ctx.config.targetDir);
  } catch {
    logWarn(`Could not clean up ${ctx.config.targetDir}. Remove it manually.`);
  }
}

function printNextSteps(ctx: CreateContext): void {
  const { config } = ctx;
  const lines: string[] = [];

  if (!config.inPlace) {
    const rel = relative(ctx.cwd, config.targetDir) || config.projectName;
    lines.push(`cd ${rel}`);
  }
  if (!ctx.installed) {
    lines.push(installCommand(config.packageManager));
  }
  lines.push(runDevCommand(config.packageManager));

  note(
    [
      ...lines.map((line) => pc.cyan(line)),
      pc.dim("then fill the S3_* values in .env"),
    ].join("\n"),
    "Next steps",
  );
  outro(`${pc.bold(config.projectName)} is ready — docs: ${DOCS_URL}`);
}
