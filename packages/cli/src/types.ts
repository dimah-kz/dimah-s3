export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type TemplateId = string;

export type TemplateMeta = {
  id: TemplateId;
  title: string;
  hint?: string;
  /**
   * Template ships app code under `src/` and exposes the create `--src` option.
   * Only Next.js-style starters set this today.
   */
  srcLayout?: boolean;
};

export type CreateConfig = {
  projectName: string;
  targetDir: string;
  /** Target directory is the current working directory (`create .`). */
  inPlace: boolean;
  template: TemplateId;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  /** Keep the template `src/` directory (default true). */
  src: boolean;
  overwrite: boolean;
};

export type CreateFlags = {
  dir?: string;
  template?: string;
  packageManager?: string;
  install?: boolean;
  git?: boolean;
  src?: boolean;
  overwrite?: boolean;
  yes?: boolean;
};

/** Shared state passed to every create step. */
export type CreateContext = {
  readonly config: CreateConfig;
  readonly template: TemplateMeta;
  /** Snapshot directory the template is copied from. */
  readonly templateDir: string;
  readonly cwd: string;
  /** Target directory did not exist before this run — safe to remove on failure. */
  createdTargetDir: boolean;
  /** Drives the final instructions: skipped or failed installs are surfaced. */
  installed: boolean;
};
