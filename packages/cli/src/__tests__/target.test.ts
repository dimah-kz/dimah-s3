import { describe, expect, it } from "vitest";

import { resolveTarget } from "@/create/target";

const cwd = "/work/projects/current-folder";

describe("resolveTarget", () => {
  it("uses the given directory as both path and name", () => {
    const target = resolveTarget("my-app", cwd);
    expect(target.targetDir).toBe(`${cwd}/my-app`);
    expect(target.projectName).toBe("my-app");
    expect(target.inPlace).toBe(false);
  });

  it("names nested paths after the last segment", () => {
    const target = resolveTarget("apps/My App", cwd);
    expect(target.targetDir).toBe(`${cwd}/apps/My App`);
    expect(target.projectName).toBe("my-app");
  });

  it("names the current directory after its folder", () => {
    for (const input of [".", "./", "  .  "]) {
      const target = resolveTarget(input, cwd);
      expect(target.targetDir).toBe(cwd);
      expect(target.projectName).toBe("current-folder");
      expect(target.inPlace).toBe(true);
    }
  });

  it("resolves parent and absolute paths", () => {
    expect(resolveTarget("../sibling", cwd).targetDir).toBe(
      "/work/projects/sibling",
    );
    expect(resolveTarget("/tmp/elsewhere", cwd).projectName).toBe("elsewhere");
  });

  it("falls back to the current directory for empty input", () => {
    expect(resolveTarget("", cwd).inPlace).toBe(true);
  });
});
