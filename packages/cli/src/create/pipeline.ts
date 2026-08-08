import pc from "picocolors";
import { relative } from "pathe";

import type { CreateConfig } from "../types.js";
import { loadCatalog, resolveTemplateMeta } from "../templates/registry.js";
import { installCommand, runDevCommand } from "../utils/package-manager.js";
import { intro, note, outro, spinner } from "../utils/ui.js";
import { installDeps } from "./steps/install-deps.js";
import { initGit } from "./steps/init-git.js";
import {
  applyProjectName,
  copyTemplate,
  validateTarget,
  writeEnv,
} from "./steps/scaffold.js";

export async function runCreatePipeline(config: CreateConfig): Promise<void> {
  intro();

  const templates = loadCatalog();
  const meta = resolveTemplateMeta(templates, config.template);

  await validateTarget(config);

  const s = spinner();
  s.start(`Scaffolding ${meta.title} template`);
  await copyTemplate(config);
  await applyProjectName(config);
  await writeEnv(config);
  s.stop(`Scaffolded ${meta.title} template`);

  await installDeps(config);
  await initGit(config);

  const rel = relative(process.cwd(), config.targetDir) || config.projectName;
  const lines = [`cd ${rel}`, "Fill S3_* values in .env"];
  if (!config.install) {
    lines.push(installCommand(config.packageManager));
  }
  lines.push(runDevCommand(config.packageManager));

  note(lines.map((line) => pc.cyan(line)).join("\n"), "Next steps");
  outro(`Created ${pc.bold(config.projectName)}`);
}
