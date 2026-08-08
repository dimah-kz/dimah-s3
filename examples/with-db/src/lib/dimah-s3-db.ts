import { drizzleAdapter } from "fumadb/adapters/drizzle";
import { DimahS3DB } from "@dimah-s3/db";
import { db } from "@/lib/db";

export const dimahS3Db = DimahS3DB.client(
  drizzleAdapter({ db, provider: "sqlite" }),
);
