import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateStep } from "@/create/step";
import { runSteps } from "@/create/step";
import type { CreateContext } from "@/types";
import { CliError, EXIT_CANCEL } from "@/utils/errors";

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
    generatedEnv: [],
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

  it("stops with exit code 130 once the signal aborts", async () => {
    const controller = new AbortController();
    const ran: string[] = [];
    const run = runSteps(
      [
        step("scaffold", async (_ctx, _report, signal) => {
          ran.push("scaffold");
          controller.abort();
          expect(signal.aborted).toBe(true);
        }),
        step("install", async () => {
          ran.push("install");
        }),
      ],
      context(),
      controller.signal,
    );

    await expect(run).rejects.toMatchObject({ exitCode: EXIT_CANCEL });
    expect(ran).toEqual(["scaffold"]);
  });

  it("treats a recoverable step that fails after a cancel as cancelled", async () => {
    const controller = new AbortController();
    const ran: string[] = [];
    const run = runSteps(
      [
        step(
          "install",
          async () => {
            controller.abort();
            throw new Error("the install was stopped");
          },
          { recoverable: true },
        ),
        step("git", async () => {
          ran.push("git");
        }),
      ],
      context(),
      controller.signal,
    );

    await expect(run).rejects.toMatchObject({ exitCode: EXIT_CANCEL });
    expect(ran).toEqual([]);
  });

  it("runs no step when the signal aborted before the first one", async () => {
    const controller = new AbortController();
    controller.abort();
    const ran: string[] = [];

    await expect(
      runSteps(
        [
          step("scaffold", async () => {
            ran.push("scaffold");
          }),
        ],
        context(),
        controller.signal,
      ),
    ).rejects.toMatchObject({ exitCode: EXIT_CANCEL });
    expect(ran).toEqual([]);
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
