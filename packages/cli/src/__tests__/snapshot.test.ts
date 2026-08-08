import { describe, expect, it } from "vitest";

import {
  resolveCatalogSpecifier,
  transformTemplatePackageJson,
} from "../snapshot/transform.js";

describe("resolveCatalogSpecifier", () => {
  const catalog = {
    react: "^19.2.8",
    "react-dom": "^19.2.8",
    next: "16.3.0",
  };

  it("resolves catalog: from the package name", () => {
    expect(resolveCatalogSpecifier("catalog:", "react", catalog)).toBe(
      "^19.2.8",
    );
  });

  it("resolves named catalog: aliases", () => {
    expect(resolveCatalogSpecifier("catalog:next", "whatever", catalog)).toBe(
      "16.3.0",
    );
  });

  it("passes through concrete ranges", () => {
    expect(resolveCatalogSpecifier("^1.0.0", "lodash", catalog)).toBe("^1.0.0");
  });

  it("throws when the catalog key is missing", () => {
    expect(() =>
      resolveCatalogSpecifier("catalog:", "missing-pkg", catalog),
    ).toThrow(/No catalog entry/);
  });
});

describe("transformTemplatePackageJson", () => {
  it("resolves catalog ranges and pins @dimah-s3/* to the CLI version", () => {
    const { pkg, warnings } = transformTemplatePackageJson(
      {
        name: "dimah-s3-nextjs",
        dependencies: {
          react: "catalog:",
          "@dimah-s3/server": "^0.4.0",
        },
        devDependencies: {
          "@types/react": "catalog:",
        },
      },
      {
        catalog: {
          react: "^19.2.8",
          "@types/react": "^19.2.18",
        },
        cliVersion: "0.4.1",
      },
    );

    expect(pkg.dependencies).toEqual({
      react: "^19.2.8",
      "@dimah-s3/server": "^0.4.1",
    });
    expect(pkg.devDependencies).toEqual({
      "@types/react": "^19.2.18",
    });
    expect(warnings.some((w) => w.includes("@dimah-s3/server"))).toBe(true);
  });

  it("fails on workspace protocol leaks", () => {
    expect(() =>
      transformTemplatePackageJson(
        {
          dependencies: {
            "@dimah-s3/core": "workspace:*",
          },
        },
        { catalog: {}, cliVersion: "0.4.1" },
      ),
    ).toThrow(/workspace/);
  });

  it("fails on @workspace/* packages", () => {
    expect(() =>
      transformTemplatePackageJson(
        {
          devDependencies: {
            "@workspace/eslint-config": "workspace:*",
          },
        },
        { catalog: {}, cliVersion: "0.4.1" },
      ),
    ).toThrow(/workspace/);
  });
});
