import { readFileSync, writeFileSync } from "node:fs";
import { packageConfig } from "@workspace/tsup-config";

const SHEBANG = "#!/usr/bin/env node\n";

export default packageConfig({
  // Only the bin is published. The snapshot script reads
  // `src/snapshot/transform.ts` as source.
  entry: { index: "src/index.ts" },
  platform: "node",
  target: "node22",
  async onSuccess() {
    const indexPath = "dist/index.js";
    const content = readFileSync(indexPath, "utf8");
    if (!content.startsWith("#!")) {
      writeFileSync(indexPath, `${SHEBANG}${content}`);
    }
  },
});
