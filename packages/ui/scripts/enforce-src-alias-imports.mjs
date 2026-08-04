import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageRoot = resolve(__dirname, "..");
const srcRoot = resolve(packageRoot, "src");
const sourceExtensions = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

function walk(dir, acc = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, acc);
      continue;
    }
    if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function resolveLocalTarget(fromFile, specifier) {
  const fromDir = dirname(fromFile);
  const base = resolve(fromDir, specifier);

  const asFile = sourceExtensions
    .map((ext) => `${base}${ext}`)
    .find((candidate) => existsSync(candidate));
  if (asFile) {
    return asFile;
  }

  const asIndex = sourceExtensions
    .map((ext) => join(base, `index${ext}`))
    .find((candidate) => existsSync(candidate));
  if (asIndex) {
    return asIndex;
  }

  return null;
}

function toAliasPath(absPath) {
  let rel = relative(srcRoot, absPath).replace(/\\/g, "/");
  rel = rel.replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/, "");
  rel = rel.replace(/\/index$/, "");
  return rel.length > 0 ? `@/${rel}` : "@";
}

function rewriteImports(content, fromFile) {
  const fromPattern = /(from\s+["'])(\.[^"']+)(["'])/g;
  const sideEffectPattern = /(import\s+["'])(\.[^"']+)(["'])/g;

  const rewrite = (_match, prefix, specifier, suffix) => {
    const target = resolveLocalTarget(fromFile, specifier);
    if (!target) {
      return `${prefix}${specifier}${suffix}`;
    }
    if (!target.startsWith(srcRoot)) {
      return `${prefix}${specifier}${suffix}`;
    }
    return `${prefix}${toAliasPath(target)}${suffix}`;
  };

  const withFrom = content.replace(fromPattern, rewrite);
  return withFrom.replace(sideEffectPattern, rewrite);
}

const files = walk(srcRoot);
let changedFiles = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  const rewritten = rewriteImports(original, file);
  if (rewritten !== original) {
    writeFileSync(file, rewritten, "utf8");
    changedFiles += 1;
  }
}

console.log(
  `[dimah-s3-ui] Normalized source imports to @/ in ${changedFiles} file(s)`,
);
