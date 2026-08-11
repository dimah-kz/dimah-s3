import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  blank,
  done,
  formatRepo,
  formatSyncSummary,
  heading,
  ok,
  parseShadcnOutput,
  runPnpm,
  step,
} from "./lib/cli.mjs";

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(uiRoot, "../..");
const uiComponentsDir = path.join(uiRoot, "src", "components", "ui");

function listInstalledComponents() {
  return readdirSync(uiComponentsDir)
    .filter((name) => name.endsWith(".tsx"))
    .map((name) => name.replace(/\.tsx$/, ""))
    .sort();
}

/**
 * @param {{ skipFormat?: boolean }} [opts]
 */
export function syncShadcn(opts = {}) {
  const components = listInstalledComponents();

  if (components.length === 0) {
    throw new Error(`No components found in ${uiComponentsDir}`);
  }

  step("shadcn", `updating ${components.length} component(s)…`);

  const { combined } = runPnpm(
    ["dlx", "shadcn@latest", "add", ...components, "--overwrite", "--yes"],
    { cwd: uiRoot },
  );

  const summary = parseShadcnOutput(combined);
  ok("shadcn", formatSyncSummary(summary));

  if (!opts.skipFormat) {
    blank();
    // Scope to this package — repo-wide prettier can fail on missing
    // app CSS paths referenced by prettier-plugin-tailwindcss.
    formatRepo({
      cwd: repoRoot,
      paths: [
        "packages/ui/src",
        "packages/ui/styles.css",
        "packages/ui/components.json",
      ],
    });
  }

  return summary;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const started = Date.now();
  heading("ui:sync · shadcn");
  syncShadcn();
  done(Date.now() - started);
}
