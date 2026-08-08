export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
/** SIGINT convention — used for user-initiated cancellation. */
export const EXIT_CANCEL = 130;

export class CliError extends Error {
  readonly exitCode: number;

  constructor(
    message: string,
    exitCode = EXIT_ERROR,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
