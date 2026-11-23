import { packageConfig } from "@workspace/tsup-config";

export default packageConfig({
  entry: ["src/index.ts", "src/client.ts"],
});
