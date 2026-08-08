/**
 * Smoke-install and build each standalone `templates/<id>/`.
 *
 * Templates are outside the monorepo workspace, so this is the way to verify
 * starters still install and compile against published npm ranges.
 *
 * Usage:
 *   pnpm templates:build
 *   pnpm templates:build -- nextjs
 */
import {
  assertConcreteNpmRanges,
  resolveTemplateIds,
  run,
  templateDir,
} from "./templates-shared.mjs";

const ids = resolveTemplateIds();

for (const id of ids) {
  const dir = templateDir(id);
  console.log(`\n=== build templates/${id} ===`);
  assertConcreteNpmRanges(dir);
  run("pnpm", ["install"], dir);
  run("pnpm", ["run", "build"], dir);
  console.log(`[ok] templates/${id}`);
}

console.log(`\nBuilt ${ids.length} template(s): ${ids.join(", ")}`);
