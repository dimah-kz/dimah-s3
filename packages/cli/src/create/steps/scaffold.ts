import { cp } from "node:fs/promises";
import { join } from "pathe";

import type { CreateConfig } from "../../types.js";
import {
  assertTemplateExists,
  getTemplateDir,
  loadCatalog,
  resolveTemplateMeta,
} from "../../templates/registry.js";
import { CliError } from "../../utils/errors.js";
import {
  copyDir,
  ensureEmptyDir,
  pathExists,
  readJson,
  renameIfExists,
  writeJson,
} from "../../utils/fs.js";
import { assertValidPackageName } from "../../utils/project-name.js";

export async function validateTarget(config: CreateConfig): Promise<void> {
  assertValidPackageName(config.projectName);
  const templates = loadCatalog();
  resolveTemplateMeta(templates, config.template);
  await assertTemplateExists(config.template);

  try {
    await ensureEmptyDir(config.targetDir, config.overwrite);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }
}

export async function copyTemplate(config: CreateConfig): Promise<void> {
  const src = getTemplateDir(config.template);
  await copyDir(src, config.targetDir);
}

export async function applyProjectName(config: CreateConfig): Promise<void> {
  const pkgPath = join(config.targetDir, "package.json");
  if (!(await pathExists(pkgPath))) {
    throw new CliError(`Template is missing package.json at ${pkgPath}`);
  }

  const pkg = await readJson<Record<string, unknown>>(pkgPath);
  pkg.name = config.projectName;
  await writeJson(pkgPath, pkg);

  await renameIfExists(
    join(config.targetDir, "_gitignore"),
    join(config.targetDir, ".gitignore"),
  );
}

export async function writeEnv(config: CreateConfig): Promise<void> {
  const example = join(config.targetDir, ".env.example");
  const envPath = join(config.targetDir, ".env");
  if (!(await pathExists(example))) return;
  if (await pathExists(envPath)) return;
  await cp(example, envPath);
}
