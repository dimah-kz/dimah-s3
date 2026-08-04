import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compileAndWrite } from "fuma-translate/cli";

/**
 * Scan react + ui sources (Fuma only associates keys with `useTranslations()`
 * call sites). Write the generated `Translations` type into `src/` for tsc.
 */
const reactRoot = fileURLToPath(new URL("..", import.meta.url));
const uiSrc = join(reactRoot, "../ui/src");
const reactSrc = join(reactRoot, "src");
const outDir = join(reactRoot, ".translations");

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, acc);
      continue;
    }
    if (/\.(tsx|ts)$/.test(name) && !name.endsWith(".d.ts")) {
      acc.push(relative(reactRoot, path).split("\\").join("/"));
    }
  }
  return acc;
}

const input = [...walk(reactSrc), ...walk(uiSrc)].filter(
  (path) => !path.endsWith("src/translations/types.ts"),
);

const { keyCount } = await compileAndWrite({
  input,
  out: outDir,
});

writeFileSync(
  join(reactSrc, "translations/types.ts"),
  `${readFileSync(join(outDir, "index.ts"), "utf8").trimEnd()}\n`,
);

console.log(`Compiled ${keyCount} translation keys from ${input.length} files`);
