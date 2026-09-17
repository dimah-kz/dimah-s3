/**
 * Raise plugin `warn` rules to `error` so lint fails instead of logging.
 *
 * Plugin configs type `rules` as `Partial<RulesConfig>` (values may be missing).
 *
 * @param {import("eslint").Linter.Config["rules"]} rules
 * @returns {import("eslint").Linter.RulesRecord}
 */
export function errorifyRules(rules = {}) {
  /** @type {import("eslint").Linter.RulesRecord} */
  const next = {};
  for (const [name, value] of Object.entries(rules)) {
    if (value === undefined) {
      continue;
    }
    if (value === "warn" || value === 1) {
      next[name] = "error";
      continue;
    }
    if (Array.isArray(value) && (value[0] === "warn" || value[0] === 1)) {
      next[name] = ["error", ...value.slice(1)];
      continue;
    }
    next[name] = value;
  }
  return next;
}
