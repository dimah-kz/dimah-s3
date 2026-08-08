/**
 * Smoke-install + build (+ check-types) each standalone `templates/<id>/`.
 *
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
  run("pnpm", ["run", "check-types"], dir);
  console.log(`[ok] templates/${id}`);
}

console.log(`\nBuilt ${ids.length} template(s): ${ids.join(", ")}`);
