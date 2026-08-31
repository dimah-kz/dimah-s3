import type { DimahS3Logger } from "@/types";

export const defaultLogger: DimahS3Logger = {
  error: (message, ...args) => {
    console.error("[dimah-s3]", message, ...args);
  },
  warn: (message, ...args) => {
    console.warn("[dimah-s3]", message, ...args);
  },
};

export function resolveLogger(
  logger: DimahS3Logger | false | undefined,
): DimahS3Logger {
  if (logger === false) return {};
  if (!logger) return defaultLogger;
  return logger;
}
