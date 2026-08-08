/**
 * Fail when shared app source drifts between templates/<id> and examples/with-<id>.
 * Framework examples mirror starters; with-db is intentionally separate (no template twin).
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/** Files expected to differ (or exist only on one side). */
const IGNORE_NAMES = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "eslint.config.js",
  "tsconfig.json",
  "tsconfig.server.json",
  "AGENTS.md",
  "README.md",
  "CHANGELOG.md",
  ".gitignore",
  "favicon.ico",
]);

/** @param {string} name */
function shouldIgnoreName(name) {
  if (IGNORE_NAMES.has(name)) return true;
  // Local env files; keep `.env.example` in the compared set.
  if (name.startsWith(".env") && name !== ".env.example") return true;
  if (name.endsWith(".tsbuildinfo")) return true;
  return false;
}

const PAIRS = [
  { template: "nextjs", example: "with-nextjs" },
  { template: "vite", example: "with-vite" },
  { template: "hono", example: "with-hono" },
];

/**
 * @param {string} dir
 * @param {string} [base]
 * @returns {string[]}
 */
function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".turbo" ||
      entry === "dist" ||
      entry === ".next" ||
      entry === ".git"
    ) {
      continue;
    }
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      out.push(...listFiles(full, base));
      continue;
    }
    if (shouldIgnoreName(entry)) continue;
    out.push(relative(base, full).split(sep).join("/"));
  }
  return out;
}

/** @param {string} filePath */
function hashFile(filePath) {
  const buf = readFileSync(filePath);
  // Normalize CRLF so Windows checkouts do not false-positive.
  const normalized = buf.toString("utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(normalized).digest("hex");
}

/** @type {string[]} */
const problems = [];

for (const { template, example } of PAIRS) {
  const templateDir = resolve(root, "templates", template);
  const exampleDir = resolve(root, "examples", example);

  if (!existsSync(templateDir)) {
    problems.push(`missing template: templates/${template}`);
    continue;
  }
  if (!existsSync(exampleDir)) {
    problems.push(`missing example: examples/${example}`);
    continue;
  }

  const templateFiles = new Set(listFiles(templateDir));
  const exampleFiles = new Set(listFiles(exampleDir));

  for (const rel of templateFiles) {
    if (!exampleFiles.has(rel)) {
      problems.push(`[${template}→${example}] missing in example: ${rel}`);
    }
  }
  for (const rel of exampleFiles) {
    if (!templateFiles.has(rel)) {
      problems.push(`[${template}→${example}] extra in example: ${rel}`);
    }
  }

  for (const rel of templateFiles) {
    if (!exampleFiles.has(rel)) continue;
    const a = resolve(templateDir, rel);
    const b = resolve(exampleDir, rel);
    if (hashFile(a) !== hashFile(b)) {
      problems.push(`[${template}→${example}] content drift: ${rel}`);
    }
  }
}

if (problems.length > 0) {
  console.error("Template/example drift detected:\n");
  for (const line of problems) console.error(`  - ${line}`);
  console.error(
    "\nShared app source must match. Update both sides, or adjust scripts/examples-drift.mjs ignores.",
  );
  process.exit(1);
}

console.log(
  `OK — ${PAIRS.length} template/example pairs share identical app source.`,
);
