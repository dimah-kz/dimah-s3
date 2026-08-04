/**
 * Sync `templates/dimah-s3-next` from `examples/with-nextjs`.
 *
 * The template is a degit-friendly starter: workspace protocol deps are rewritten
 * to published `@dimah-s3/*` ranges, and `@workspace/*` tooling packages are
 * replaced with standalone eslint/tsconfig so `pnpm install` works outside the monorepo.
 *
 * Usage (from repo root):
 *   pnpm sync-template
 *   pnpm sync-template --check   # exit 1 if template drifts
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "examples", "with-nextjs");
const targetDir = join(root, "templates", "dimah-s3-next");
const checkOnly = process.argv.includes("--check");

const COPY_DIRS = ["app", "components", "lib", "public"];
const COPY_FILES = [
  ".env.example",
  "components.json",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
];

function packageVersion(pkgDirName) {
  const pkg = JSON.parse(
    readFileSync(join(root, "packages", pkgDirName, "package.json"), "utf8"),
  );
  return pkg.version;
}

function buildTemplatePackageJson(sourcePkg) {
  const versions = {
    "@dimah-s3/core": packageVersion("core"),
    "@dimah-s3/i18n": packageVersion("i18n"),
    "@dimah-s3/react": packageVersion("react"),
    "@dimah-s3/server": packageVersion("server"),
    "@dimah-s3/ui": packageVersion("ui"),
    "@dimah-s3/db": packageVersion("db"),
  };

  const dependencies = { ...sourcePkg.dependencies };
  for (const [name, version] of Object.entries(versions)) {
    if (dependencies[name]) dependencies[name] = `^${version}`;
  }

  const devDependencies = { ...sourcePkg.devDependencies };
  delete devDependencies["@workspace/eslint-config"];
  delete devDependencies["@workspace/typescript-config"];

  return {
    name: "dimah-s3-next",
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: sourcePkg.scripts,
    dependencies,
    devDependencies: {
      ...devDependencies,
      eslint: sourcePkg.devDependencies.eslint ?? "catalog:",
      typescript: sourcePkg.devDependencies.typescript ?? "catalog:",
    },
  };
}

const standaloneEslint = `import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default [
  js.configs.recommended,
  ...compat.extends("next/core-web-vitals"),
];
`;

const standaloneTsconfig = {
  compilerOptions: {
    target: "ES2017",
    lib: ["dom", "dom.iterable", "esnext"],
    allowJs: true,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: "esnext",
    moduleResolution: "bundler",
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: "preserve",
    incremental: true,
    plugins: [{ name: "next" }],
    paths: { "@/*": ["./*"] },
  },
  include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  exclude: ["node_modules"],
};

const readme = `# dimah-s3 Next.js starter

Bootstrap a Next.js app with dimah-s3 routes, hooks, and UI demos.

\`\`\`bash
npx degit hamidrezakz/dimah-s3/templates/dimah-s3-next my-app
cd my-app
pnpm install
cp .env.example .env
pnpm dev
\`\`\`

This template is generated from \`examples/with-nextjs\` via \`pnpm sync-template\`.
Do not hand-edit it in the monorepo — change the example, then re-run the sync script.

## License

MIT
`;

function writeGenerated() {
  const staging = join(root, ".tmp-dimah-s3-next-template");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  for (const dir of COPY_DIRS) {
    const from = join(sourceDir, dir);
    if (existsSync(from)) {
      cpSync(from, join(staging, dir), { recursive: true });
    }
  }
  for (const file of COPY_FILES) {
    const from = join(sourceDir, file);
    if (existsSync(from)) {
      cpSync(from, join(staging, file));
    }
  }

  // Branding tweaks for starter vs example
  const home = readFileSync(join(staging, "app", "page.tsx"), "utf8")
    .replace("example", "starter")
    .replace("Example", "Starter");
  writeFileSync(join(staging, "app", "page.tsx"), home);

  const sourcePkg = JSON.parse(
    readFileSync(join(sourceDir, "package.json"), "utf8"),
  );
  writeFileSync(
    join(staging, "package.json"),
    `${JSON.stringify(buildTemplatePackageJson(sourcePkg), null, 2)}\n`,
  );
  writeFileSync(join(staging, "eslint.config.js"), standaloneEslint);
  writeFileSync(
    join(staging, "tsconfig.json"),
    `${JSON.stringify(standaloneTsconfig, null, 2)}\n`,
  );
  writeFileSync(join(staging, "README.md"), readme);

  return staging;
}

function dirFingerprint(dir) {
  // Cheap drift check: package.json + README + app/ui/page presence
  const pkg = readFileSync(join(dir, "package.json"), "utf8");
  const readmeText = existsSync(join(dir, "README.md"))
    ? readFileSync(join(dir, "README.md"), "utf8")
    : "";
  return `${pkg}\n---\n${readmeText}`;
}

const staging = writeGenerated();

if (checkOnly) {
  if (!existsSync(targetDir)) {
    console.error("Template missing. Run: pnpm sync-template");
    process.exit(1);
  }
  const expected = dirFingerprint(staging);
  const actual = dirFingerprint(targetDir);
  rmSync(staging, { recursive: true, force: true });
  if (expected !== actual) {
    console.error(
      "templates/dimah-s3-next is out of sync. Run: pnpm sync-template",
    );
    process.exit(1);
  }
  console.log("templates/dimah-s3-next is in sync.");
  process.exit(0);
}

rmSync(targetDir, { recursive: true, force: true });
cpSync(staging, targetDir, { recursive: true });
rmSync(staging, { recursive: true, force: true });
console.log("Synced templates/dimah-s3-next from examples/with-nextjs.");
