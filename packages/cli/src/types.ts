export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type TemplateId = string;

export type TemplateMeta = {
  id: TemplateId;
  title: string;
  hint?: string;
};

export type CreateConfig = {
  projectName: string;
  targetDir: string;
  template: TemplateId;
  packageManager: PackageManager;
  install: boolean;
  git: boolean;
  overwrite: boolean;
};

export type CreateFlags = {
  dir?: string;
  template?: string;
  packageManager?: string;
  install?: boolean;
  git?: boolean;
  overwrite?: boolean;
  yes?: boolean;
};
