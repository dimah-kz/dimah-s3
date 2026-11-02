import { relative } from "pathe";
import pc from "picocolors";

import type { CreateContext } from "@/types";
import { removeDir } from "@/utils/fs";
import { installCommand, runDevCommand } from "@/utils/package-manager";
import { logWarn, note, outro } from "@/utils/ui";
import type { ResolvedCreate } from "./config.js";
import type { CreateStep } from "./step.js";
import { runSteps } from "./step.js";
import { installStep } from "./steps/install-deps.js";
import { initGitStep } from "./steps/init-git.js";
import { scaffoldStep } from "./steps/scaffold.js";

const DOCS_URL = "https://v2.s3.dimah.dev";

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
    generatedEnv: [],
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

export type NextSteps = {
  /** Shell commands to run, in order. */
  commands: string[];
  /** Setup reminders shown under the commands. */
  hints: string[];
};

export function nextSteps(ctx: CreateContext): NextSteps {
  const { config } = ctx;
  const commands: string[] = [];

  if (!config.inPlace) {
    const rel = relative(ctx.cwd, config.targetDir) || config.projectName;
    commands.push(`cd ${rel}`);
  }
  if (!ctx.installed) {
    commands.push(installCommand(config.packageManager));
  }
  commands.push(runDevCommand(config.packageManager));

  return {
    commands,
    hints: [
      ...ctx.generatedEnv.map(
        (key) => `${key} was generated in .env — keep it private`,
      ),
      "then fill the S3_* values in .env",
      'allow browser PUT in bucket CORS (POST only if you set upload.method: "POST")',
    ],
  };
}

function printNextSteps(ctx: CreateContext): void {
  const { commands, hints } = nextSteps(ctx);
  note(
    [
      ...commands.map((line) => pc.cyan(line)),
      ...hints.map((line) => pc.dim(line)),
    ].join("\n"),
    "Next steps",
  );
  outro(
    `${pc.bold(ctx.config.projectName || "Your app")} is ready — docs: ${DOCS_URL}`,
  );
}
