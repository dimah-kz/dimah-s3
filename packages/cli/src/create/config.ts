import { resolve } from "pathe";

import {
  assertTemplateExists,
  loadCatalog,
  resolveTemplateMeta,
} from "../templates/registry.js";
import type { CreateConfig, CreateFlags, PackageManager } from "../types.js";
import { CliError } from "../utils/errors.js";
import {
  detectPackageManager,
  parsePackageManagerFlag,
} from "../utils/package-manager.js";
import {
  assertValidPackageName,
  sanitizeProjectName,
} from "../utils/project-name.js";
import { handleCancel, p } from "../utils/ui.js";

function defaultProjectName(dir?: string): string {
  if (dir && dir !== "." && dir !== "./") {
    return sanitizeProjectName(dir);
  }
  return "my-app";
}

export async function resolveCreateConfig(
  flags: CreateFlags,
): Promise<CreateConfig> {
  const templates = loadCatalog();
  const yes = Boolean(flags.yes);

  let packageManager: PackageManager;
  try {
    packageManager =
      parsePackageManagerFlag(flags.packageManager) ?? detectPackageManager();
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error));
  }

  // Project name / directory
  let projectName: string;
  if (flags.dir && flags.dir.trim() !== "") {
    projectName = sanitizeProjectName(flags.dir);
  } else if (yes) {
    projectName = defaultProjectName(flags.dir);
  } else {
    const answer = await p.text({
      message: "Project name",
      placeholder: "my-app",
      defaultValue: "my-app",
      validate(value) {
        const name = sanitizeProjectName(value || "my-app");
        try {
          assertValidPackageName(name);
          return undefined;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
    });
    handleCancel(answer);
    projectName = sanitizeProjectName(String(answer) || "my-app");
  }
  assertValidPackageName(projectName);

  const targetDir = resolve(
    process.cwd(),
    flags.dir && flags.dir.trim() !== "" ? flags.dir.trim() : projectName,
  );

  // Template
  let templateId: string;
  if (flags.template) {
    resolveTemplateMeta(templates, flags.template);
    templateId = flags.template;
  } else if (yes) {
    templateId = templates[0]!.id;
  } else {
    const answer = await p.select({
      message: "Framework",
      options: templates.map((t) => ({
        value: t.id,
        label: t.title,
        hint: t.hint,
      })),
    });
    handleCancel(answer);
    templateId = String(answer);
  }
  await assertTemplateExists(templateId);

  // Install
  let install: boolean;
  if (typeof flags.install === "boolean") {
    install = flags.install;
  } else if (yes) {
    install = true;
  } else {
    const answer = await p.confirm({
      message: `Install dependencies with ${packageManager}?`,
      initialValue: true,
    });
    handleCancel(answer);
    install = Boolean(answer);
  }

  // Git
  let git: boolean;
  if (typeof flags.git === "boolean") {
    git = flags.git;
  } else if (yes) {
    git = true;
  } else {
    const answer = await p.confirm({
      message: "Initialize a git repository?",
      initialValue: true,
    });
    handleCancel(answer);
    git = Boolean(answer);
  }

  return {
    projectName,
    targetDir,
    template: templateId,
    packageManager,
    install,
    git,
    overwrite: Boolean(flags.overwrite),
  };
}
