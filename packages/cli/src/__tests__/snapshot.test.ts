import { describe, expect, it } from "vitest";

import { transformTemplatePackageJson } from "../snapshot/transform.js";

describe("transformTemplatePackageJson", () => {
  it("pins @dimah-s3/* to the CLI version", () => {
    const { pkg, warnings } = transformTemplatePackageJson(
      {
        name: "dimah-s3-nextjs",
        dependencies: {
          react: "^19.2.8",
          "@dimah-s3/server": "^0.4.0",
        },
        devDependencies: {
          "@types/react": "^19.2.18",
        },
      },
      { cliVersion: "0.4.1" },
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
        { cliVersion: "0.4.1" },
      ),
    ).toThrow(/concrete npm range/);
  });

  it("fails on catalog: protocol", () => {
    expect(() =>
      transformTemplatePackageJson(
        {
          dependencies: {
            react: "catalog:",
          },
        },
        { cliVersion: "0.4.1" },
      ),
    ).toThrow(/concrete npm range/);
  });

  it("fails on @workspace/* packages", () => {
    expect(() =>
      transformTemplatePackageJson(
        {
          devDependencies: {
            "@workspace/eslint-config": "workspace:*",
          },
        },
        { cliVersion: "0.4.1" },
      ),
    ).toThrow(/concrete npm range/);
  });
});
