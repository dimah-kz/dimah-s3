import { packageConfig } from "@workspace/tsup-config";

export default packageConfig({
  entry: {
    index: "src/index.ts",
    engine: "src/engine.ts",
  },
  banner: { js: '"use client";' },
});
