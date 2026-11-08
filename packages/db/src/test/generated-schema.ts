import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { drizzleAdapter } from "@/adapters/drizzle";
import { prismaAdapter } from "@/adapters/prisma";
import { DimahS3DB } from "@/fuma-db";

/** Git-ignored; Vite still transforms files here, unlike `node_modules`. */
const GENERATED_DIR = join(import.meta.dirname, "../../.vitest/generated");

export type DrizzleProvider = "sqlite" | "postgresql" | "mysql";

/** The Drizzle schema `runCli` → `generate` writes for `provider`. */
export function drizzleSchemaCode(provider: DrizzleProvider): string {
  return DimahS3DB.client(
    drizzleAdapter({ db: undefined, provider }),
  ).generateSchema("latest").code;
}

/** The Prisma schema `runCli` → `generate` writes for `provider`. */
export function prismaSchemaCode(
  provider: "sqlite" | "postgresql" | "mysql",
): string {
  return DimahS3DB.client(
    prismaAdapter({ prisma: undefined, provider }),
  ).generateSchema("latest").code;
}

/**
 * Imports the generated Drizzle schema for `provider`. The file is named by
 * its content, and written once by whichever test worker gets there first.
 */
export async function importDrizzleSchema(
  provider: DrizzleProvider,
): Promise<{ relations: never }> {
  const code = drizzleSchemaCode(provider);
  const hash = createHash("sha256").update(code).digest("hex").slice(0, 12);
  const file = join(GENERATED_DIR, `drizzle-${provider}-${hash}.ts`);
  if (!existsSync(file)) {
    mkdirSync(GENERATED_DIR, { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, code);
    renameSync(temp, file);
  }
  return (await import(pathToFileURL(file).href)) as { relations: never };
}
