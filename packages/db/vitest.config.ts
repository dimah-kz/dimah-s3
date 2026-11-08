import { packageConfig } from "@workspace/vitest-config";

export default packageConfig(import.meta.dirname, {
  name: "db",
  setupFiles: ["./src/test/time-zone.ts"],
  // Each PostgreSQL test boots a PGlite (WASM) instance. Under a full
  // Turbo run that startup can pass the default 10s hook limit.
  testTimeout: 30_000,
  hookTimeout: 30_000,
});
