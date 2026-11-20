import { spawn, type ChildProcess } from "node:child_process";

/** Output kept for the error message of a failed command. */
const OUTPUT_TAIL_CHARS = 4000;

export type RunCommandOptions = {
  cwd: string;
  /** Stops the command, and every process it started, when it aborts. */
  signal?: AbortSignal;
};

/**
 * Runs a command to completion with its output captured.
 *
 * A non-zero exit rejects with the end of what the command printed. An
 * aborted `signal` stops the command and rejects with the abort reason.
 * The command gets no stdin, so it can never wait for an answer nobody
 * sees.
 *
 * `command` and `args` must be fixed text, never user input: on Windows
 * they run through the shell, which package manager `.cmd` shims need.
 */
export function runCommand(
  command: string,
  args: readonly string[],
  options: RunCommandOptions,
): Promise<void> {
  const { cwd, signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }

    const windows = process.platform === "win32";
    // One string with the shell: an args array plus `shell` is deprecated.
    const child = windows
      ? spawn([command, ...args].join(" "), {
          cwd,
          shell: true,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        })
      : spawn(command, [...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });

    let output = "";
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-OUTPUT_TAIL_CHARS);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    const onAbort = () => stopProcessTree(child);
    signal?.addEventListener("abort", onAbort, { once: true });
    const settle = (error?: Error) => {
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) reject(abortReason(signal));
      else if (error) reject(error);
      else resolve();
    };

    child.once("error", (error) => settle(error));
    child.once("close", (code) => {
      if (code === 0) {
        settle();
        return;
      }
      const shown = [command, ...args].join(" ");
      const tail = output.trim();
      settle(
        new Error(
          `${shown} exited with code ${code ?? "unknown"}${tail ? `\n${tail}` : ""}`,
        ),
      );
    });
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error("The command was stopped.");
}

/**
 * Stops `child` and what it started. On Windows the child is a shell, and
 * ending the shell alone would leave the package manager running, so the
 * whole tree goes through `taskkill`.
 */
function stopProcessTree(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    }).once("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
}
