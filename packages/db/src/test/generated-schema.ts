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

/** `DimahS3DB`, or its tables in the PostgreSQL schema `dbSchema`. */
function library(dbSchema?: string) {
  return dbSchema ? DimahS3DB.names.schema(dbSchema) : DimahS3DB;
}

/** The Drizzle schema `runCli` → `generate` writes for `provider`. */
export function drizzleSchemaCode(
  provider: DrizzleProvider,
  dbSchema?: string,
): string {
  return library(dbSchema)
    .client(drizzleAdapter({ db: undefined, provider }))
    .generateSchema("latest").code;
}

/** The Prisma schema `runCli` → `generate` writes for `provider`. */
export function prismaSchemaCode(
  provider: "sqlite" | "postgresql" | "mysql",
  dbSchema?: string,
): string {
  return library(dbSchema)
    .client(prismaAdapter({ prisma: undefined, provider }))
    .generateSchema("latest").code;
}

/**
 * Imports the generated Drizzle schema for `provider`. The file is named by
 * its content, and written once by whichever test worker gets there first.
 */
export async function importDrizzleSchema(
  provider: DrizzleProvider,
  dbSchema?: string,
): Promise<{ relations: never }> {
  const code = drizzleSchemaCode(provider, dbSchema);
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
