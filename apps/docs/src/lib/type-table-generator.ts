import path from "node:path";
import {
  createFileSystemGeneratorCache,
  createGenerator,
} from "fumadocs-typescript";

/** Monorepo root — AutoTypeTable paths are relative to this directory. */
export const typeTableBasePath = path.join(process.cwd(), "../..");

export const typeTableGenerator = createGenerator({
  cache: createFileSystemGeneratorCache(".next/fumadocs-typescript"),
  tsconfigPath: path.join(process.cwd(), "tsconfig.json"),
});
