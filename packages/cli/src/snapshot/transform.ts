/**
 * Pure transforms used by the template snapshot script and unit tests.
 */

export function resolveCatalogSpecifier(
  specifier: string,
  packageName: string,
  catalog: Record<string, string>,
): string {
  if (specifier === "catalog:") {
    const version = catalog[packageName];
    if (!version) {
      throw new Error(
        `No catalog entry for "${packageName}" (specifier "catalog:")`,
      );
    }
    return version;
  }

  if (specifier.startsWith("catalog:")) {
    const named = specifier.slice("catalog:".length);
    const version = catalog[named];
    if (!version) {
      throw new Error(
        `No catalog entry named "${named}" for package "${packageName}"`,
      );
    }
    return version;
  }

  return specifier;
}

export function transformTemplatePackageJson(
  pkg: Record<string, unknown>,
  options: { catalog: Record<string, string>; cliVersion: string },
): { pkg: Record<string, unknown>; warnings: string[] } {
  const { catalog, cliVersion } = options;
  const warnings: string[] = [];
  const next = structuredClone(pkg);

  function transformDeps(
    deps: Record<string, string> | undefined,
    field: string,
  ) {
    if (!deps || typeof deps !== "object") return;
    for (const [name, range] of Object.entries(deps)) {
      if (typeof range !== "string") continue;

      if (range.startsWith("workspace:") || name.startsWith("@workspace/")) {
        throw new Error(
          `${field}["${name}"] must not use workspace protocol or @workspace/* (got "${range}")`,
        );
      }

      let resolved = resolveCatalogSpecifier(range, name, catalog);

      if (name.startsWith("@dimah-s3/")) {
        const expected = `^${cliVersion}`;
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
