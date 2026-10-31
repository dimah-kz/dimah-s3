import { packageConfig } from "@workspace/vitest-config";

export default packageConfig(import.meta.dirname, {
  name: "db",
  // Each PostgreSQL test boots a PGlite (WASM) instance, which can pass 5s
  // when turbo runs every package's tests at once.
  testTimeout: 30_000,
});
