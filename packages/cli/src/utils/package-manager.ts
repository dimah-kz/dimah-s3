import type { PackageManager } from "@/types";

const KNOWN: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];

/**
 * Detect the package manager that invoked this process via
 * `npm_config_user_agent` (standard create-* pattern).
 */
export function detectPackageManager(
  userAgent = process.env.npm_config_user_agent,
): PackageManager {
  if (!userAgent) return "npm";
  const name = userAgent.split("/")[0]?.toLowerCase();
  if (name === "pnpm" || name === "npm" || name === "yarn" || name === "bun") {
    return name;
  }
  return "npm";
}

export function parsePackageManagerFlag(
  value: string | undefined,
): PackageManager | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if ((KNOWN as string[]).includes(normalized)) {
    return normalized as PackageManager;
  }
  throw new Error(
    `Unknown package manager "${value}". Expected one of: ${KNOWN.join(", ")}`,
  );
}

export function installCommand(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}

export function runDevCommand(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm dev";
    case "yarn":
      return "yarn dev";
    case "bun":
      return "bun run dev";
    default:
      return "npm run dev";
  }
}
