import { readFile, writeFile } from "node:fs/promises";
import { packageConfig } from "@workspace/tsup-config";

const CLIENT_DIRECTIVE = '"use client";\n';

export default packageConfig({
  entry: ["src/index.ts"],
  async onSuccess() {
    // esbuild strips module-level "use client" during bundle; restore for Next RSC.
    const file = "dist/index.js";
    const content = await readFile(file, "utf8");
    if (
      !content.startsWith('"use client"') &&
      !content.startsWith("'use client'")
    ) {
      await writeFile(file, CLIENT_DIRECTIVE + content);
    }
  },
});
