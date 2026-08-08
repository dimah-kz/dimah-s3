import type { ResolvedTemplate } from "../templates/registry.js";
import { loadCatalog, resolveTemplate } from "../templates/registry.js";
import type { CreateConfig, CreateFlags, PackageManager } from "../types.js";
import { CliError, EXIT_CANCEL, errorMessage } from "../utils/errors.js";
import { listDir } from "../utils/fs.js";
import {
  detectPackageManager,
  parsePackageManagerFlag,
} from "../utils/package-manager.js";
import {
  assertValidPackageName,
  sanitizeProjectName,
} from "../utils/project-name.js";
import { ask, isInteractive, logWarn, p } from "../utils/ui.js";
import { PRESERVED_ENTRIES, resolveTarget } from "./target.js";

const DEFAULT_PROJECT_NAME = "my-app";

export type ResolvedCreate = {
  config: CreateConfig;
  template: ResolvedTemplate;
};

/**
 * Precedence for every option: explicit flag, then a prompt when the session is
 * interactive, then the documented default.
 */
async function resolveOption<T>(
  flag: T | undefined,
  options: { interactive: boolean; prompt: () => Promise<T>; fallback: T },
): Promise<T> {
  if (flag !== undefined) return flag;
  return options.interactive ? options.prompt() : options.fallback;
}

function validateNameInput(value: string | undefined): string | undefined {
  try {
    assertValidPackageName(sanitizeProjectName(value || DEFAULT_PROJECT_NAME));
    return undefined;
  } catch (error) {
    return errorMessage(error);
  }
}

/** Existing entries that would collide with the scaffold. */
async function findConflicts(targetDir: string): Promise<string[]> {
  const entries = await listDir(targetDir);
  return entries.filter((entry) => !PRESERVED_ENTRIES.includes(entry));
}

export async function resolveCreateConfig(
  flags: CreateFlags,
): Promise<ResolvedCreate> {
  const cwd = process.cwd();
  const templates = await loadCatalog();

  const interactive = !flags.yes && isInteractive();
  if (!flags.yes && !interactive) {
    logWarn("Non-interactive terminal detected — continuing with defaults.");
  }

  let packageManager: PackageManager;
  try {
    packageManager =
      parsePackageManagerFlag(flags.packageManager) ?? detectPackageManager();
  } catch (error) {
    throw new CliError(errorMessage(error), undefined, { cause: error });
  }

  const dirInput = await resolveOption(flags.dir?.trim() || undefined, {
    interactive,
    fallback: DEFAULT_PROJECT_NAME,
    prompt: () =>
      ask(
        p.text({
          message: "Project name",
          placeholder: DEFAULT_PROJECT_NAME,
          defaultValue: DEFAULT_PROJECT_NAME,
          validate: validateNameInput,
        }),
      ),
  });

  const target = resolveTarget(dirInput, cwd);
  assertValidPackageName(target.projectName);

  const templateId = await resolveOption(flags.template, {
    // A single template needs no question.
    interactive: interactive && templates.length > 1,
    fallback: templates[0]!.id,
    prompt: () =>
      ask(
        p.select({
          message: "Framework",
          options: templates.map((t) => ({
            value: t.id,
            label: t.title,
            hint: t.hint,
          })),
        }),
      ),
  });
  const template = await resolveTemplate(templateId);

  const install = await resolveOption(flags.install, {
    interactive,
    fallback: true,
    prompt: () =>
      ask(
        p.confirm({
          message: `Install dependencies with ${packageManager}?`,
          initialValue: true,
        }),
      ),
  });

  const git = await resolveOption(flags.git, {
    interactive,
    fallback: true,
    prompt: () =>
      ask(
        p.confirm({
          message: "Initialize a git repository?",
          initialValue: true,
        }),
      ),
  });

  const overwrite = await resolveOverwrite(target.targetDir, {
    flag: Boolean(flags.overwrite),
    interactive,
  });

  return {
    config: {
      projectName: target.projectName,
      targetDir: target.targetDir,
      inPlace: target.inPlace,
      template: template.meta.id,
      packageManager,
      install,
      git,
      overwrite,
    },
    template,
  };
}

/**
 * Decides whether existing files in the target may be replaced. Confirmation
 * happens here so every filesystem mutation stays inside the pipeline steps.
 */
async function resolveOverwrite(
  targetDir: string,
  options: { flag: boolean; interactive: boolean },
): Promise<boolean> {
  const conflicts = await findConflicts(targetDir);
  if (conflicts.length === 0) return false;
  if (options.flag) return true;

  if (!options.interactive) {
    throw new CliError(
      `Target directory "${targetDir}" is not empty (${conflicts.length} entries). Pass --overwrite to replace its contents.`,
    );
  }

  const preview = conflicts.slice(0, 5).join(", ");
  const more = conflicts.length > 5 ? `, +${conflicts.length - 5} more` : "";
  const confirmed = await ask(
    p.confirm({
      message: `"${targetDir}" already contains ${conflicts.length} entries (${preview}${more}). Delete them? (${PRESERVED_ENTRIES.join(" and ")} are kept)`,
      initialValue: false,
    }),
  );

  if (!confirmed) {
    p.cancel("Target directory is not empty.");
    throw new CliError("Cancelled", EXIT_CANCEL);
  }
  return true;
}
