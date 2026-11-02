/**
 * Pure transforms used by the template snapshot script and unit tests.
 */

/** Stable CLIs float with a caret. Prerelease CLIs pin the exact version. */
export function templateDependencyRange(cliVersion: string): string {
  return cliVersion.includes("-") ? cliVersion : `^${cliVersion}`;
}

export function transformTemplatePackageJson(
  pkg: Record<string, unknown>,
  options: { cliVersion: string },
): { pkg: Record<string, unknown>; warnings: string[] } {
  const { cliVersion } = options;
  const warnings: string[] = [];
  const next = structuredClone(pkg);

  function transformDeps(
    deps: Record<string, string> | undefined,
    field: string,
  ) {
    if (!deps || typeof deps !== "object") return;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== "string") continue;

      if (
        range.startsWith("workspace:") ||
        range.startsWith("catalog:") ||
        name.startsWith("@workspace/")
      ) {
        throw new Error(
          `${field}["${name}"] must use a concrete npm range (got "${range}")`,
        );
      }

      let resolved = range;

      if (name.startsWith("@dimah-s3/")) {
        // A caret on a prerelease would also accept later breaking betas
        // and, once it exists, stable 2.x.
        const expected = templateDependencyRange(cliVersion);
        if (resolved !== expected) {
          warnings.push(
            `${field}["${name}"]: "${resolved}" → "${expected}" (aligned to CLI version)`,
          );
        }
        resolved = expected;
      }

      deps[name] = resolved;
    }
  }

  transformDeps(
    next.dependencies as Record<string, string> | undefined,
    "dependencies",
  );
  transformDeps(
    next.devDependencies as Record<string, string> | undefined,
    "devDependencies",
  );
  transformDeps(
    next.peerDependencies as Record<string, string> | undefined,
    "peerDependencies",
  );
  transformDeps(
    next.optionalDependencies as Record<string, string> | undefined,
    "optionalDependencies",
  );

  return { pkg: next, warnings };
}
