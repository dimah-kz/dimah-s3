import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { components } from "../items/components";

const SCHEMA = "https://ui.shadcn.com/schema/registry.json";
const root = resolve(import.meta.dirname, "..");

const outputs = [
  {
    file: "registry/dimah-s3-ui/registry.json",
    items: components,
  },
] as const;

for (const { file, items } of outputs) {
  const out = resolve(root, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify({ $schema: SCHEMA, items }, null, 2)}\n`,
    "utf8",
  );
}

console.log("registry item manifests generated");
