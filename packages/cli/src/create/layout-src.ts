import { rename } from "node:fs/promises";
import { join } from "pathe";

import {
  listDir,
  pathExists,
  readJson,
  removeDir,
  writeJson,
} from "../utils/fs.js";

/**
 * Template apps ship with a `src/` directory. When the user opts out on a
 * `srcLayout` template (Next.js), move everything under `src/` to the project
 * root and rewrite path aliases in `tsconfig.json` / `components.json`.
 * Do not use this for Vite/Hono — their entry HTML and scripts assume `src/`.
 */
export async function flattenSrcDirectory(targetDir: string): Promise<void> {
  const srcDir = join(targetDir, "src");
  if (!(await pathExists(srcDir))) return;

  for (const entry of await listDir(srcDir)) {
    await rename(join(srcDir, entry), join(targetDir, entry));
  }
  await removeDir(srcDir);

  await patchTsconfigPaths(targetDir);
  await patchComponentsCss(targetDir);
}

async function patchTsconfigPaths(targetDir: string): Promise<void> {
  const path = join(targetDir, "tsconfig.json");
  if (!(await pathExists(path))) return;

  const tsconfig = await readJson<{
    compilerOptions?: { paths?: Record<string, string[]> };
  }>(path);

  const paths = tsconfig.compilerOptions?.paths;
  if (!paths) return;

  let changed = false;
  for (const [alias, targets] of Object.entries(paths)) {
    const next = targets.map((t) => t.replace(/^\.\/src\//, "./"));
    if (next.some((t, i) => t !== targets[i])) {
      paths[alias] = next;
      changed = true;
    }
  }
  if (changed) await writeJson(path, tsconfig);
}

async function patchComponentsCss(targetDir: string): Promise<void> {
  const path = join(targetDir, "components.json");
  if (!(await pathExists(path))) return;

  const components = await readJson<{
    tailwind?: { css?: string };
  }>(path);

  const css = components.tailwind?.css;
  if (!css?.startsWith("src/")) return;

  components.tailwind = {
    ...components.tailwind,
    css: css.slice("src/".length),
  };
  await writeJson(path, components);
}
