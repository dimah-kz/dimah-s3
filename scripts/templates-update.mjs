/**
 * `pnpm update --latest` in each standalone `templates/<id>/`.
 *
 *   pnpm templates:update
 *   pnpm templates:update -- nextjs vite
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
  console.log(`\n=== update templates/${id} ===`);
  run("pnpm", ["update", "--latest"], dir);
  assertConcreteNpmRanges(dir);
  console.log(`[ok] templates/${id}`);
}

console.log(`\nUpdated ${ids.length} template(s): ${ids.join(", ")}`);
