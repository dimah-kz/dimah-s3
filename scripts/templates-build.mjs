/**
 * Smoke-install + build (+ check-types) each standalone `templates/<id>/`.
 *
 *   pnpm templates:build
 *   pnpm templates:build -- nextjs
 */
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  assertConcreteNpmRanges,
  resolveTemplateIds,
  run,
  templateDir,
} from "./templates-shared.mjs";

const ids = resolveTemplateIds();

// Next.js collects the S3 route module at build time, which constructs
// `dimahS3()` and requires a bucket. Smoke builds have no real credentials.
process.env.S3_BUCKET ??= "your-bucket-name";
process.env.S3_REGION ??= "auto";
process.env.S3_ENDPOINT ??= "https://your-endpoint.example.com";
process.env.S3_ACCESS_KEY_ID ??= "your-access-key-id";
process.env.S3_SECRET_ACCESS_KEY ??= "your-secret-access-key";

for (const id of ids) {
  const dir = templateDir(id);
  console.log(`\n=== build templates/${id} ===`);
  assertConcreteNpmRanges(dir);
  const envExample = join(dir, ".env.example");
  const envFile = join(dir, ".env");
  if (!existsSync(envFile) && existsSync(envExample)) {
    copyFileSync(envExample, envFile);
  }
  run("pnpm", ["install"], dir);
  run("pnpm", ["run", "build"], dir);
  run("pnpm", ["run", "check-types"], dir);
  console.log(`[ok] templates/${id}`);
}

console.log(`\nBuilt ${ids.length} template(s): ${ids.join(", ")}`);
