import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./db/dimah-s3.ts", "./db/dimah-s3-share.ts"],
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DATABASE_PATH ?? "./local.db",
  },
});
