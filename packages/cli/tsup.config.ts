import { readFileSync, writeFileSync } from "node:fs";
import { packageConfig } from "@workspace/tsup-config";

const SHEBANG = "#!/usr/bin/env node\n";

export default packageConfig({
  entry: {
    index: "src/index.ts",
    "snapshot/transform": "src/snapshot/transform.ts",
  },
  platform: "node",
  target: "node20",
  async onSuccess() {
    const indexPath = "dist/index.js";
    const content = readFileSync(indexPath, "utf8");
    if (!content.startsWith("#!")) {
      writeFileSync(indexPath, `${SHEBANG}${content}`);
    }
  },
});
