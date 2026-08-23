import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateStep } from "@/create/step";
import { runSteps } from "@/create/step";
import type { CreateContext } from "@/types";
import { CliError } from "@/utils/errors";

function context(): CreateContext {
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
    createdTargetDir: false,
    installed: false,
  };
}

function step(
  id: string,
  run: CreateStep["run"],
  extra: Partial<CreateStep> = {},
) {
  return { id, title: id, run, ...extra } satisfies CreateStep;
}

describe("runSteps", () => {
  // The runner drives real Clack spinners; keep their output out of the report.
  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs steps in order and skips disabled ones", async () => {
    const ran: string[] = [];
    await runSteps(
      [
        step("first", async () => {
          ran.push("first");
        }),
        step(
          "skipped",
          async () => {
            ran.push("skipped");
          },
          { enabled: () => false },
        ),
        step("last", async () => {
          ran.push("last");
        }),
      ],
      context(),
    );

    expect(ran).toEqual(["first", "last"]);
  });

  it("aborts on the first failing step", async () => {
    const ran: string[] = [];
    await expect(
      runSteps(
        [
          step("boom", async () => {
            throw new Error("kaboom");
          }),
          step("never", async () => {
            ran.push("never");
          }),
        ],
        context(),
      ),
    ).rejects.toThrow(CliError);

    expect(ran).toEqual([]);
  });

  it("keeps going when a recoverable step fails but reports it", async () => {
    const ran: string[] = [];
    const { failedSteps } = await runSteps(
      [
        step(
          "install",
          async () => {
            throw new Error("network down");
          },
          { recoverable: true },
        ),
        step("git", async () => {
          ran.push("git");
        }),
      ],
      context(),
    );

    expect(ran).toEqual(["git"]);
    expect(failedSteps).toEqual(["install"]);
  });

  it("passes the context so steps can record outcomes", async () => {
    const ctx = context();
    await runSteps(
      [
        step("install", async (c, report) => {
          report("working");
          c.installed = true;
          return "installed";
        }),
      ],
      ctx,
    );

    expect(ctx.installed).toBe(true);
  });
});
