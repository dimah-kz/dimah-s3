import { rmSync } from "node:fs";
import { join } from "node:path";

const roots = [
  "apps/docs",
  "examples/with-db",
  "examples/with-nextjs",
  "templates/dimah-s3-next",
];

for (const root of roots) {
  for (const dir of [".next", ".source"]) {
    rmSync(join(root, dir), { recursive: true, force: true });
  }
}

console.log("Removed local .next and .source artifacts.");
