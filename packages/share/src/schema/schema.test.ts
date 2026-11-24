import { drizzleAdapter } from "@dimah-s3/db/adapters/drizzle";
import { prismaAdapter } from "@dimah-s3/db/adapters/prisma";
import { describe, expect, it } from "vitest";
import { DimahS3Share, SHARE_SCHEMA_VERSION } from "@/fuma-db";

describe("share schema", () => {
  it("is version 1.0.0", () => {
    expect(SHARE_SCHEMA_VERSION).toBe("1.0.0");
  });

  it.each(["sqlite", "postgresql", "mysql"] as const)(
    "generates the Drizzle and Prisma schema for %s",
    (provider) => {
      const drizzle = DimahS3Share.client(
        drizzleAdapter({ db: undefined, provider }),
      ).generateSchema("latest").code;
      expect(drizzle).toContain('"share_link"');
      expect(drizzle).toContain("share_link_token_uk");
      expect(drizzle).toContain("private_dimah_s3_share_settings");

      const prisma = DimahS3Share.client(
        prismaAdapter({ prisma: undefined, provider }),
      ).generateSchema("latest").code;
      expect(prisma).toContain("share_link");
    },
  );
});
