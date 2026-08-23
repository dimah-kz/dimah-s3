import path from "node:path";
import {
  createFileSystemGeneratorCache,
  createGenerator,
  type Generator,
} from "fumadocs-typescript";

/** Monorepo root — AutoTypeTable paths are relative to this directory. */
export const typeTableBasePath = path.join(process.cwd(), "../..");

const generators = new Map<string, Generator>();

function generatorForTsconfig(
  cacheKey: string,
  tsconfigPath: string,
): Generator {
  const existing = generators.get(cacheKey);
  if (existing) return existing;

  const generator = createGenerator({
    cache: createFileSystemGeneratorCache(
      `.next/fumadocs-typescript-${cacheKey}`,
    ),
    tsconfigPath,
  });
  generators.set(cacheKey, generator);
  return generator;
}

/**
 * Docs-app generator. Do not use this for `packages/*` sources — those files
 * resolve `@/` against their own package, and the docs `@/` alias would collapse
 * types.
 */
export const typeTableGenerator = generatorForTsconfig(
  "docs",
  path.join(process.cwd(), "tsconfig.json"),
);

/** Pick the generator that can resolve `@/` imports for the given source path. */
export function typeTableGeneratorFor(filePath?: string): Generator {
  const match = filePath?.replaceAll("\\", "/").match(/packages\/([^/]+)\//);
  if (match) {
    const pkg = match[1];
    return generatorForTsconfig(
      pkg,
      path.join(typeTableBasePath, "packages", pkg, "tsconfig.json"),
    );
  }
  return typeTableGenerator;
}
