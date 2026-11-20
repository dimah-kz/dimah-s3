import { join } from "pathe";

import type { CreateContext } from "@/types";
import { throwIfCancelled } from "@/utils/cancel";
import { CliError } from "@/utils/errors";
import {
  copyDir,
  emptyDir,
  ensureDir,
  pathExists,
  readJson,
  removeFile,
  renameIfExists,
  writeJson,
} from "@/utils/fs";
import { writeProjectEnv } from "@/create/env";
import { flattenSrcDirectory } from "@/create/layout-src";
import type { CreateStep } from "@/create/step";
import { PRESERVED_ENTRIES } from "@/create/target";

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

/** pnpm settings file of the starter. Other package managers ignore it. */
const PNPM_WORKSPACE_FILE = "pnpm-workspace.yaml";

/**
 * Drops the starter's `pnpm-workspace.yaml` unless the project uses pnpm:
 * it only holds pnpm settings.
 */
export async function applyPackageManager(ctx: CreateContext): Promise<void> {
  if (ctx.config.packageManager === "pnpm") return;
  await removeFile(join(ctx.config.targetDir, PNPM_WORKSPACE_FILE));
}

/**
 * Writes `.env` with generated values such as `DIMAH_S3_SECRET`. An existing
 * `.env` is only appended to, and a key that already has a value is kept.
 */
export async function writeEnv(ctx: CreateContext): Promise<void> {
  ctx.generatedEnv = await writeProjectEnv(ctx.config.targetDir);
}

/** Templates ship with `src/`; flatten when the user opted out. */
export async function applySrcLayout(ctx: CreateContext): Promise<void> {
  if (ctx.config.src) return;
  await flattenSrcDirectory(ctx.config.targetDir);
}

export const scaffoldStep: CreateStep = {
  id: "scaffold",
  title: (ctx) => `Scaffolding ${ctx.template.title} template`,
  async run(ctx, report, signal) {
    await prepareTarget(ctx);
    throwIfCancelled(signal);
    report("Copying template files");
    await copyTemplate(ctx);
    throwIfCancelled(signal);
    report("Applying project name");
    await applyProjectName(ctx);
    await applyPackageManager(ctx);
    if (!ctx.config.src) {
      report("Flattening src/ directory");
      await applySrcLayout(ctx);
    }
    throwIfCancelled(signal);
    report("Writing .env");
    await writeEnv(ctx);
    return `Scaffolded ${ctx.template.title} template`;
  },
};
