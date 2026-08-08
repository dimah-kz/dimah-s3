import { readFileSync } from "node:fs";
import { dirname, join } from "pathe";
import { fileURLToPath } from "node:url";

import type { TemplateMeta } from "../types.js";
import { CliError } from "../utils/errors.js";
import { pathExists } from "../utils/fs.js";

type CatalogFile = {
  templates: TemplateMeta[];
};

function templatesRoot(): string {
  // Bundled into dist/index.js → dist/templates/
  return join(dirname(fileURLToPath(import.meta.url)), "templates");
}

export function getTemplatesRoot(): string {
  return templatesRoot();
}

export function loadCatalog(): TemplateMeta[] {
  const catalogPath = join(templatesRoot(), "catalog.json");
  let raw: string;
  try {
    raw = readFileSync(catalogPath, "utf8");
  } catch {
    throw new CliError(
      `Template catalog missing at ${catalogPath}. Run the CLI package build first.`,
    );
  }

  const parsed = JSON.parse(raw) as CatalogFile;
  if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) {
    throw new CliError("Template catalog is empty.");
  }

  for (const entry of parsed.templates) {
    if (!entry?.id || !entry?.title) {
      throw new CliError("Each catalog entry needs id and title.");
    }
  }

  return parsed.templates;
}

export function getTemplateDir(id: string): string {
  return join(templatesRoot(), id);
}

export async function assertTemplateExists(id: string): Promise<void> {
  const dir = getTemplateDir(id);
  if (!(await pathExists(dir))) {
    throw new CliError(`Unknown template "${id}" (missing ${dir}).`);
  }
}

export function resolveTemplateMeta(
  templates: TemplateMeta[],
  id: string,
): TemplateMeta {
  const found = templates.find((t) => t.id === id);
  if (!found) {
    const ids = templates.map((t) => t.id).join(", ");
    throw new CliError(`Unknown template "${id}". Available: ${ids}`);
  }
  return found;
}
