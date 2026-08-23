import { basename, resolve } from "pathe";

import { sanitizeProjectName } from "@/utils/project-name";

/**
 * Entries kept when scaffolding over an existing directory: git history and
 * `.env` are not recoverable, and a re-run is usually meant to keep both.
 */
export const PRESERVED_ENTRIES = [".git", ".env"];

export type CreateTarget = {
  targetDir: string;
  projectName: string;
  inPlace: boolean;
};

/**
 * Maps a user-supplied directory (`my-app`, `apps/my-app`, `.`, an absolute
 * path) to the target directory plus the npm name written into `package.json`.
 * The name always comes from the resolved folder, so `create .` is named after
 * the current directory instead of a generic fallback.
 */
export function resolveTarget(input: string, cwd: string): CreateTarget {
  const trimmed = input.trim();
  const targetDir = resolve(cwd, trimmed || ".");
  return {
    targetDir,
    projectName: sanitizeProjectName(basename(targetDir)),
    inPlace: targetDir === resolve(cwd),
  };
}
