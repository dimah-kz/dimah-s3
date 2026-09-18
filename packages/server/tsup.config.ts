import { packageConfig } from "@workspace/tsup-config";

export default packageConfig({
  entry: [
    "src/index.ts",
    "src/plugins.ts",
    "src/adapters/next.ts",
    "src/adapters/node.ts",
    "src/adapters/express.ts",
    "src/adapters/hono.ts",
    "src/adapters/fastify.ts",
    "src/adapters/elysia.ts",
    "src/adapters/svelte-kit.ts",
    "src/api/index.ts",
  ],
});
