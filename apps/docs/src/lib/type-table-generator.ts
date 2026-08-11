import path from "node:path";
import {
  createFileSystemGeneratorCache,
  createGenerator,
  type Generator,
} from "fumadocs-typescript";

/** Monorepo root — AutoTypeTable paths are relative to this directory. */
export const typeTableBasePath = path.join(process.cwd(), "../..");

/** Default generator for core / server / react (docs app tsconfig). */
export const typeTableGenerator = createGenerator({
  cache: createFileSystemGeneratorCache(".next/fumadocs-typescript"),
  tsconfigPath: path.join(process.cwd(), "tsconfig.json"),
});

/**
 * UI package generator — `@/*` must resolve to `packages/ui/src/*`.
 * Using the docs tsconfig maps `@/` to `apps/docs/src` and collapses types
 * to `any` (or empty tables for union props like UploadButtonProps).
 */
export const uiTypeTableGenerator = createGenerator({
  cache: createFileSystemGeneratorCache(".next/fumadocs-typescript-ui"),
  tsconfigPath: path.join(typeTableBasePath, "packages/ui/tsconfig.json"),
});

/** Pick the generator that can resolve imports for the given source path. */
export function typeTableGeneratorFor(filePath?: string): Generator {
  if (filePath?.replaceAll("\\", "/").includes("packages/ui/")) {
    return uiTypeTableGenerator;
  }
  return typeTableGenerator;
}
