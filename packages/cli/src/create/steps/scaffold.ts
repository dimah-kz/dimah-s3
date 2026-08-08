import { cp } from "node:fs/promises";
import { join } from "pathe";

import type { CreateContext } from "../../types.js";
import { CliError } from "../../utils/errors.js";
import {
  copyDir,
  emptyDir,
  ensureDir,
  pathExists,
  readJson,
  renameIfExists,
  writeJson,
} from "../../utils/fs.js";
import { flattenSrcDirectory } from "../layout-src.js";
import type { CreateStep } from "../step.js";
import { PRESERVED_ENTRIES } from "../target.js";

/**
 * Creates the target directory, or clears it when the user opted into
 * overwriting. Records whether the directory is ours so a failed run can be
 * rolled back without touching pre-existing files.
 */
export async function prepareTarget(ctx: CreateContext): Promise<void> {
  const { targetDir, overwrite } = ctx.config;
  const existed = await pathExists(targetDir);

  if (existed && overwrite) {
    await emptyDir(targetDir, { keep: PRESERVED_ENTRIES });
  }

  await ensureDir(targetDir);
  ctx.createdTargetDir = !existed;
}

export async function copyTemplate(ctx: CreateContext): Promise<void> {
  await copyDir(ctx.templateDir, ctx.config.targetDir);
}

/** Writes the project name and restores files npm cannot ship verbatim. */
export async function applyProjectName(ctx: CreateContext): Promise<void> {
  const pkgPath = join(ctx.config.targetDir, "package.json");
  if (!(await pathExists(pkgPath))) {
    throw new CliError(`Template is missing package.json at ${pkgPath}`);
  }

  const pkg = await readJson<Record<string, unknown>>(pkgPath);
  pkg.name = ctx.config.projectName;
  await writeJson(pkgPath, pkg);

  await renameIfExists(
    join(ctx.config.targetDir, "_gitignore"),
    join(ctx.config.targetDir, ".gitignore"),
  );
}

export async function writeEnv(ctx: CreateContext): Promise<void> {
  const example = join(ctx.config.targetDir, ".env.example");
  const envPath = join(ctx.config.targetDir, ".env");
  if (!(await pathExists(example))) return;
  if (await pathExists(envPath)) return;
  await cp(example, envPath);
}

/** Templates ship with `src/`; flatten when the user opted out. */
export async function applySrcLayout(ctx: CreateContext): Promise<void> {
  if (ctx.config.src) return;
  await flattenSrcDirectory(ctx.config.targetDir);
}

export const scaffoldStep: CreateStep = {
  id: "scaffold",
  title: (ctx) => `Scaffolding ${ctx.template.title} template`,
  async run(ctx, report) {
    await prepareTarget(ctx);
    report("Copying template files");
    await copyTemplate(ctx);
    report("Applying project name");
    await applyProjectName(ctx);
    if (!ctx.config.src) {
      report("Flattening src/ directory");
      await applySrcLayout(ctx);
    }
    await writeEnv(ctx);
    return `Scaffolded ${ctx.template.title} template`;
  },
};
