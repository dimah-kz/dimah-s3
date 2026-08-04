import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageRoot = resolve(__dirname, "..");
const workspaceRoot = resolve(packageRoot, "..", "..");
const srcRoot = resolve(packageRoot, "src");
const registryRoot = resolve(
  workspaceRoot,
  "registry",
  "registry",
  "dimah-s3-ui",
);
const registryPackageJsonPath = resolve(
  workspaceRoot,
  "registry",
  "package.json",
);
const uiPackageJsonPath = resolve(packageRoot, "package.json");

const sourceDirs = ["components", "hooks", "lib"];

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function removeDir(path) {
  rmSync(path, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}

function rewriteRegistryImports(filePath) {
  const ext = extname(filePath);
  if (ext !== ".ts" && ext !== ".tsx") {
    return;
  }

  const original = readFileSync(filePath, "utf8");
  const rewritten = original.replace(
    /(["'])@\/(?!registry\/dimah-s3-ui\/)([^"']+)\1/g,
    "$1@/registry/dimah-s3-ui/$2$1",
  );

  if (rewritten !== original) {
    writeFileSync(filePath, rewritten, "utf8");
  }
}

function walkAndRewrite(dir) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walkAndRewrite(fullPath);
      continue;
    }
    rewriteRegistryImports(fullPath);
  }
}

function syncDirectory(name) {
  const source = resolve(srcRoot, name);
  const target = resolve(registryRoot, name);

  removeDir(target);
  ensureDir(target);
  cpSync(source, target, { recursive: true });
  walkAndRewrite(target);
}

function syncRegistryDependencies() {
  const registryPkg = JSON.parse(readFileSync(registryPackageJsonPath, "utf8"));
  const uiPkg = JSON.parse(readFileSync(uiPackageJsonPath, "utf8"));

  const uiRequired = {
    ...(uiPkg.dependencies ?? {}),
    ...(uiPkg.peerDependencies ?? {}),
  };

  const uiDev = uiPkg.devDependencies ?? {};
  const nextDeps = { ...(registryPkg.dependencies ?? {}) };

  let changed = false;

  for (const [name, fallbackVersion] of Object.entries(uiRequired)) {
    if (name in nextDeps) {
      continue;
    }

    const version = uiDev[name] ?? fallbackVersion;
    nextDeps[name] = version;
    changed = true;
  }

  if (!changed) {
    return;
  }

  registryPkg.dependencies = Object.fromEntries(
    Object.entries(nextDeps).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(
    registryPackageJsonPath,
    `${JSON.stringify(registryPkg, null, 2)}\n`,
    "utf8",
  );
}

ensureDir(registryRoot);
for (const dir of sourceDirs) {
  syncDirectory(dir);
}
syncRegistryDependencies();

console.log(
  "[dimah-s3-ui] Synced src/{components,hooks,lib} -> registry/registry/dimah-s3-ui and ensured registry deps include UI deps",
);
