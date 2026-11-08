/**
 * The FumaDB Prisma adapter. Pass a Prisma client generated with the models
 * `runCli` → `generate` writes:
 * `DimahS3DB.client(prismaAdapter({ prisma, provider: "postgresql" }))`.
 */
export { prismaAdapter, type PrismaConfig } from "fumadb/adapters/prisma";
