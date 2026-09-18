/// <reference types="node" />
import { createRequire } from "node:module";
import { packageConfig } from "@workspace/tsup-config";

const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

export default packageConfig({
  entry: ["src/index.ts", "src/cli.ts", "src/client/index.ts"],
  define: {
    __DIMAH_S3_DB_VERSION__: JSON.stringify(version),
  },
});
