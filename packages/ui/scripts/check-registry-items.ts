import { existsSync, readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

import { componentCssVars, components } from "./registry-items";

const uiSrcRoot = resolve(import.meta.dirname, "../src");
const uiCssPath = resolve(import.meta.dirname, "../css/shadcn.css");
const uiPackageJsonPath = resolve(import.meta.dirname, "../package.json");

const SOURCE_EXTS = [".ts", ".tsx"] as const;
const SKIP_PACKAGES = new Set(["react", "react-dom", "react/jsx-runtime"]);
const IMPORT_RE = /(?:from|import)\s+["']([^"']+)["']/g;

function fail(message: string): never {
  console.error(`[registry] ${message}`);
  process.exit(1);
}

function packageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("@/")) {
    return null;
  }
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    if (!scope || !name) return specifier;
    return `${scope}/${name}`;
  }
  return specifier.split("/")[0] ?? specifier;
}

function typesPackage(pkg: string): string {
  if (pkg.startsWith("@")) {
    return `@types/${pkg.slice(1).replace("/", "__")}`;
  }
  return `@types/${pkg}`;
}

function extractImports(content: string): string[] {
  const specifiers: string[] = [];
  for (const match of content.matchAll(IMPORT_RE)) {
    const specifier = match[1];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function resolveUiFile(relativePath: string): string | null {
  const abs = resolve(uiSrcRoot, relativePath);
  if (existsSync(abs)) return abs;
  return null;
}

function fileKey(path: string): string {
  return path.replace(/\.(tsx?)$/, "");
}

const uiPkg = JSON.parse(readFileSync(uiPackageJsonPath, "utf8")) as {
  devDependencies?: Record<string, string>;
};
const uiTypesPackages = new Set(
  Object.keys(uiPkg.devDependencies ?? {}).filter((name) =>
    name.startsWith("@types/"),
  ),
);

const css = readFileSync(uiCssPath, "utf8");
const cssThemeTokens = new Set(
  [...css.matchAll(/--(color-dimah-s3-[a-z0-9-]+)\s*:/g)].flatMap((match) => {
    const token = match[1];
    return token ? [token] : [];
  }),
);
const itemThemeTokens = new Set(Object.keys(componentCssVars.theme));
for (const token of cssThemeTokens) {
  if (!itemThemeTokens.has(token)) {
    fail(`cssVars.theme is missing --${token} from packages/ui/css/shadcn.css`);
  }
}

let errors = 0;

for (const item of components) {
  const files = item.files ?? [];
  const fileKeys = new Set<string>(files.map((file) => fileKey(file.path)));
  const registryDeps = new Set<string>(item.registryDependencies ?? []);
  const npmDeps = new Set<string>(item.dependencies ?? []);
  const npmDevDeps = new Set<string>(item.devDependencies ?? []);

  for (const file of files) {
    const base = basename(file.path, extname(file.path));
    if (registryDeps.has(base)) {
      console.error(
        `[registry] ${item.name}: ${file.path} basename collides with registryDependency "${base}". The shadcn CLI rewrites same-named imports onto the UI primitive.`,
      );
      errors += 1;
    }

    if (!resolveUiFile(file.path)) {
      console.error(
        `[registry] ${item.name}: missing source packages/ui/src/${file.path}`,
      );
      errors += 1;
    }
  }

  const seen = new Set<string>();
  const queue: string[] = files.map((file) => file.path);

  while (queue.length > 0) {
    const relativePath = queue.pop();
    if (!relativePath || seen.has(relativePath)) continue;
    seen.add(relativePath);

    const abs = resolveUiFile(relativePath);
    if (!abs) continue;

    const specifiers = extractImports(readFileSync(abs, "utf8"));
    for (const specifier of specifiers) {
      const pkg = packageName(specifier);
      if (pkg) {
        if (SKIP_PACKAGES.has(pkg) || SKIP_PACKAGES.has(specifier)) continue;
        if (!npmDeps.has(pkg)) {
          console.error(
            `[registry] ${item.name}: ${relativePath} imports "${pkg}" but it is not in dependencies`,
          );
          errors += 1;
        }
        const types = typesPackage(pkg);
        if (uiTypesPackages.has(types) && !npmDevDeps.has(types)) {
          console.error(
            `[registry] ${item.name}: ${relativePath} imports "${pkg}" but "${types}" is not in devDependencies`,
          );
          errors += 1;
        }
        continue;
      }

      if (!specifier.startsWith("@/")) continue;
      const aliasPath = specifier.slice(2);

      if (aliasPath === "lib/utils" || aliasPath.startsWith("lib/utils/")) {
        continue;
      }

      if (aliasPath.startsWith("components/ui/")) {
        const primitive = aliasPath.slice("components/ui/".length);
        if (!registryDeps.has(primitive)) {
          console.error(
            `[registry] ${item.name}: ${relativePath} imports @/${aliasPath} but registryDependencies is missing "${primitive}"`,
          );
          errors += 1;
        }
        continue;
      }

      if (!fileKeys.has(aliasPath)) {
        console.error(
          `[registry] ${item.name}: ${relativePath} imports @/${aliasPath} but files[] does not include it`,
        );
        errors += 1;
        continue;
      }

      const next = SOURCE_EXTS.map((ext) => `${aliasPath}${ext}`).find(
        (candidate) => resolveUiFile(candidate),
      );
      if (next) queue.push(next);
    }
  }
}

if (errors > 0) {
  fail(`${errors} item completeness error(s)`);
}

console.log(
  `registry items complete (${components.length} item(s), files + deps + cssVars)`,
);
