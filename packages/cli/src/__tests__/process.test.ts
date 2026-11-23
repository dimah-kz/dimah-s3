import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelledError, listenForCancel } from "@/utils/cancel";
import { EXIT_CANCEL } from "@/utils/errors";
import { runCommand } from "@/utils/process";

const cwd = tmpdir();
const windows = process.platform === "win32";

/**
 * Runs a script with the test's own Node, so the command is always there.
 * Windows runs one shell string, so the path and the script are quoted.
 * Other platforms receive the raw argv.
 */
function shellText(value: string): string {
  return windows ? JSON.stringify(value) : value;
}

const node = shellText(process.execPath);

function script(source: string): string[] {
  return ["-e", shellText(source)];
}

describe("runCommand", () => {
  it("resolves when the command exits with 0", async () => {
    await expect(
      runCommand(node, script("process.exit(0)"), { cwd }),
    ).resolves.toBeUndefined();
  });

  it("rejects with the exit code and the end of the output", async () => {
    await expect(
      runCommand(
        node,
        script("console.error('registry unreachable'); process.exit(3)"),
        { cwd },
      ),
    ).rejects.toThrow(/exited with code 3[\s\S]*registry unreachable/);
  });

  it("stops the command when the signal aborts", async () => {
    const controller = new AbortController();
    const started = Date.now();
    const run = runCommand(node, script("setInterval(() => {}, 1000)"), {
      cwd,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 300);

    await expect(run).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true);
    // The command would never end on its own.
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 20_000);

  it("does not start the command when the signal already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runCommand(node, script("process.exit(0)"), {
        cwd,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});

describe("listenForCancel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("aborts on SIGINT and stops listening when disposed", () => {
    const before = process.listenerCount("SIGINT");
    const cancellation = listenForCancel();
    expect(process.listenerCount("SIGINT")).toBe(before + 1);
    expect(cancellation.signal.aborted).toBe(false);

    process.emit("SIGINT");
    expect(cancellation.signal.aborted).toBe(true);
    // One Ctrl+C is handled; the next one ends the process the default way.
    expect(process.listenerCount("SIGINT")).toBe(before);

    cancellation.dispose();
    expect(process.listenerCount("SIGTERM")).toBe(
      process.listenerCount("SIGINT"),
    );
  });

  it("leaves no listener behind when nothing was cancelled", () => {
    const sigint = process.listenerCount("SIGINT");
    const sigterm = process.listenerCount("SIGTERM");
    listenForCancel().dispose();
    expect(process.listenerCount("SIGINT")).toBe(sigint);
    expect(process.listenerCount("SIGTERM")).toBe(sigterm);
  });
});

describe("cancelledError", () => {
  it("exits with the SIGINT code", () => {
    expect(cancelledError().exitCode).toBe(EXIT_CANCEL);
  });
});
