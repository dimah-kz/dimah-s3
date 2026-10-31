import { describe, expect, it } from "vitest";

import { nextSteps } from "@/create/pipeline";
import type { CreateContext } from "@/types";

function context(overrides: Partial<CreateContext> = {}): CreateContext {
  return {
    config: {
      projectName: "demo-app",
      targetDir: "/tmp/demo-app",
      inPlace: false,
      template: "nextjs",
      packageManager: "pnpm",
      install: true,
      git: true,
      src: true,
      overwrite: false,
    },
    template: { id: "nextjs", title: "Next.js" },
    templateDir: "/tmp/templates/nextjs",
    cwd: "/tmp",
    createdTargetDir: true,
    installed: true,
    generatedEnv: [],
    ...overrides,
  };
}

describe("nextSteps", () => {
  it("lists cd and dev, plus install when it did not run", () => {
    expect(nextSteps(context()).commands).toEqual(["cd demo-app", "pnpm dev"]);
    expect(nextSteps(context({ installed: false })).commands).toEqual([
      "cd demo-app",
      "pnpm install",
      "pnpm dev",
    ]);
  });

  it("describes PUT as the default upload method for CORS", () => {
    const { hints } = nextSteps(context());
    const cors = hints.find((line) => line.includes("CORS"));
    expect(cors).toBe(
      'allow browser PUT in bucket CORS (POST only if you set upload.method: "POST")',
    );
    // PUT is already the default, so no provider-specific method switch is suggested.
    expect(hints.some((line) => line.includes("R2"))).toBe(false);
    expect(hints.some((line) => line.includes("POST/PUT"))).toBe(false);
  });

  it("warns about generated env keys", () => {
    const { hints } = nextSteps(context({ generatedEnv: ["DIMAH_S3_SECRET"] }));
    expect(hints[0]).toBe(
      "DIMAH_S3_SECRET was generated in .env — keep it private",
    );
  });
});
