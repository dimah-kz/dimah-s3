import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";

import type { TemplateMeta } from "@/types";
import { CliError, errorMessage } from "@/utils/errors";
import { pathExists } from "@/utils/fs";

type CatalogFile = {
  templates: TemplateMeta[];
};

export type ResolvedTemplate = {
  meta: TemplateMeta;
  dir: string;
};

/**
 * Snapshotted templates sit next to the bundle (`dist/templates`). When running
 * from source (tests, `tsx`) the same snapshot is reached through the package
 * root, so the registry works without duplicating catalog data.
 */
function templatesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "templates");
}

function fallbackTemplatesRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "dist", "templates");
}

async function resolveTemplatesRoot(): Promise<string> {
  const primary = templatesRoot();
  if (await pathExists(join(primary, "catalog.json"))) return primary;

  const fallback = fallbackTemplatesRoot();
  if (await pathExists(join(fallback, "catalog.json"))) return fallback;

  throw new CliError(
    `Template catalog missing at ${join(primary, "catalog.json")}. Run the CLI package build first.`,
  );
}

let cachedCatalog: TemplateMeta[] | undefined;

export async function loadCatalog(): Promise<TemplateMeta[]> {
  if (cachedCatalog) return cachedCatalog;

  const root = await resolveTemplatesRoot();
  const catalogPath = join(root, "catalog.json");

  let parsed: CatalogFile;
  try {
    parsed = JSON.parse(await readFile(catalogPath, "utf8")) as CatalogFile;
  } catch (error) {
    throw new CliError(
      `Template catalog at ${catalogPath} is not readable JSON: ${errorMessage(error)}`,
      undefined,
      { cause: error },
    );
  }

  if (!Array.isArray(parsed.templates) || parsed.templates.length === 0) {
    throw new CliError("Template catalog is empty.");
  }
  for (const entry of parsed.templates) {
    if (!entry?.id || !entry?.title) {
      throw new CliError("Each catalog entry needs id and title.");
    }
  }

  cachedCatalog = parsed.templates;
  return cachedCatalog;
}

/** Pure catalog lookup, split out so it can be unit tested without the disk. */
export function findTemplate(
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

export function normalizeTemplateId(id: string): string {
  return id.trim().toLowerCase();
}

/** Validates the id against the catalog and the snapshot on disk in one pass. */
export async function resolveTemplate(id: string): Promise<ResolvedTemplate> {
  const templates = await loadCatalog();
  const meta = findTemplate(templates, normalizeTemplateId(id));
  const dir = join(await resolveTemplatesRoot(), meta.id);

  if (!(await pathExists(dir))) {
    throw new CliError(
      `Template "${meta.id}" is listed in the catalog but missing at ${dir}.`,
    );
  }

  return { meta, dir };
}
