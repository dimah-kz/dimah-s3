import fs from "node:fs";
import path from "node:path";

function analyze(baseDir, uiDir, srcDirs) {
  const keep = new Set();
  const uiFiles = fs.readdirSync(uiDir).filter((f) => f.endsWith(".tsx"));
  const allUi = new Set(uiFiles.map((f) => f.replace(".tsx", "")));

  function findImports(file) {
    const content = fs.readFileSync(file, "utf8");
    const re = /from ["']@\/components\/ui\/([^"']+)["']/g;
    let m;
    while ((m = re.exec(content)) !== null) keep.add(m[1]);
  }

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(tsx?|mdx)$/.test(ent.name)) findImports(p);
    }
  }

  for (const d of srcDirs) walk(path.join(baseDir, d));

  let changed = true;
  while (changed) {
    changed = false;
    for (const name of [...keep]) {
      const fp = path.join(uiDir, `${name}.tsx`);
      if (!fs.existsSync(fp)) continue;
      const content = fs.readFileSync(fp, "utf8");
      const re = /from ["']@\/components\/ui\/([^"']+)["']/g;
      let m;
      while ((m = re.exec(content)) !== null) {
        if (!keep.has(m[1])) {
          keep.add(m[1]);
          changed = true;
        }
      }
    }
  }

  const unused = [...allUi].filter((x) => !keep.has(x)).sort();
  console.log(`BASE: ${baseDir}`);
  console.log(`KEEP: ${[...keep].sort().join(", ")}`);
  console.log(`UNUSED (${unused.length}): ${unused.join(", ")}`);
  console.log();
}

analyze("examples/with-db", "examples/with-db/src/components/ui", ["src"]);
analyze("examples/with-nextjs", "examples/with-nextjs/components/ui", [
  "app",
  "components",
  "lib",
]);
analyze("apps/docs", "apps/docs/src/components/ui", ["src", "content"]);
