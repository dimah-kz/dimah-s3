import os from "node:os";

/** Cap Next.js build workers locally to avoid OOM when the editor is open. */
export function nextBuildCpus() {
  if (process.env.CI) return undefined;
  return 1;
}
