/**
 * Raise plugin `warn` rules to `error` so lint fails instead of logging.
 *
 * @param {import("eslint").Linter.RulesRecord | undefined} rules
 * @returns {import("eslint").Linter.RulesRecord}
 */
export function errorifyRules(rules = {}) {
  return Object.fromEntries(
    Object.entries(rules).map(([name, value]) => {
      if (value === "warn" || value === 1) {
        return [name, "error"];
      }
      if (Array.isArray(value) && (value[0] === "warn" || value[0] === 1)) {
        return [name, ["error", ...value.slice(1)]];
      }
      return [name, value];
    }),
  );
}
