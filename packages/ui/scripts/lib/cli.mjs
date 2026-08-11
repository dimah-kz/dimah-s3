import { spawnSync } from "node:child_process";

export function blank() {
  console.log();
}

/** @param {string} title */
export function heading(title) {
  console.log(`\n◆  ${title}\n`);
}

/** @param {string} label @param {string} [detail] */
export function step(label, detail = "") {
  console.log(`◯  ${line(label, detail)}`);
}

/** @param {string} label @param {string} [detail] */
export function ok(label, detail = "") {
  console.log(`◇  ${line(label, detail)}`);
}

/** @param {string} label @param {string} [detail] */
export function fail(label, detail = "") {
  console.error(`▲  ${line(label, detail)}`);
}

/** @param {number} elapsedMs */
export function done(elapsedMs) {
  const secs = (elapsedMs / 1000).toFixed(elapsedMs >= 10_000 ? 0 : 1);
  console.log(`\n◆  done in ${secs}s\n`);
}

/**
 * @param {string} text
 * @returns {{ updated: string[]; skipped: number }}
 */
export function parseShadcnOutput(text) {
  const lines = text.split(/\r?\n/);
  /** @type {string[]} */
  const updated = [];
  /** @type {string[]} */
  const extras = [];
  let skipped = 0;
  let mode = null;

  for (const lineText of lines) {
    if (/Updated\s+\d+\s+files?/i.test(lineText)) {
      mode = "updated";
      continue;
    }

    const skippedMatch = lineText.match(/Skipped\s+(\d+)\s+files?/i);
    if (skippedMatch) {
      skipped = Number(skippedMatch[1]);
      mode = "skipped";
      continue;
    }

    const fileMatch = lineText.match(
      /^\s*-\s+(.+\.(?:tsx?|jsx?|css|mjs|cjs))$/i,
    );
    if (fileMatch && mode === "updated") {
      updated.push(normalizePath(fileMatch[1].trim()));
      continue;
    }
    if (fileMatch && mode === "skipped") continue;

    if (/Updating\s+.+\.css/i.test(lineText)) {
      extras.push(
        normalizePath(lineText.replace(/^.*?Updating\s+/i, "").trim()),
      );
      mode = null;
      continue;
    }

    if (
      /Checking registry|Installing dependencies|Remember to wrap/i.test(
        lineText,
      ) ||
      /The `?.+`? component has been added/i.test(lineText)
    ) {
      mode = null;
    }
  }

  return {
    updated: [...updated, ...extras.filter((f) => !updated.includes(f))],
    skipped,
  };
}

/**
 * @param {{ updated: string[]; skipped: number }} summary
 */
export function formatSyncSummary(summary) {
  return `${summary.updated.length} updated · ${summary.skipped} unchanged`;
}

/**
 * @param {string[]} args
 * @param {{ cwd: string }} opts
 */
export function runPnpm(args, { cwd }) {
  const env = {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
  };

  // Windows .cmd shims need a shell. Pass one command string (no args array)
  // to avoid Node DEP0190.
  const result =
    process.platform === "win32"
      ? spawnSync(["pnpm", ...args].map(quoteArg).join(" "), {
          cwd,
          encoding: "utf8",
          shell: true,
          env,
        })
      : spawnSync("pnpm", args, {
          cwd,
          encoding: "utf8",
          shell: false,
          env,
        });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = `${stdout}${stderr}`;

  if (result.error) {
    fail("exec", result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    fail("failed", `exit ${result.status ?? 1}`);
    if (combined.trim()) console.error(combined.trimEnd());
    process.exit(result.status ?? 1);
  }

  return { stdout, stderr, combined };
}

/**
 * @param {{ cwd: string; paths?: string[] }} opts
 */
export function formatRepo({ cwd, paths = ["."] }) {
  step("format", "prettier…");
  runPnpm(["exec", "prettier", "--write", ...paths, "--log-level", "warn"], {
    cwd,
  });
  ok("format", "done");
}

/** @param {string} label @param {string} detail */
function line(label, detail) {
  const head = label.padEnd(12);
  return detail ? `${head}${detail}` : head;
}

/** @param {string} value */
function quoteArg(value) {
  if (value.length === 0) return '""';
  if (/[\s"&<>|^]/.test(value)) return `"${value.replace(/"/g, '\\"')}"`;
  return value;
}

/** @param {string} value */
function normalizePath(value) {
  return value.replace(/\\/g, "/");
}
