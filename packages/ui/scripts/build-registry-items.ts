import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { components } from "./registry-items";

const SCHEMA = "https://ui.shadcn.com/schema/registry.json";
const out = resolve(import.meta.dirname, "..", "registry.json");

const items = components.map((item) => ({
  ...item,
  files: item.files?.map((file) => ({
    ...file,
    path: `src/${file.path}`,
  })),
}));

writeFileSync(out, `${JSON.stringify({ $schema: SCHEMA, items }, null, 2)}\n`);

console.log("wrote packages/ui/registry.json");
