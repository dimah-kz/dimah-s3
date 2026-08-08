import { defineCommand } from "citty";

import { resolveCreateConfig } from "../create/config.js";
import { runCreatePipeline } from "../create/pipeline.js";
import type { CreateFlags } from "../types.js";
import { CliError } from "../utils/errors.js";
import { logError } from "../utils/ui.js";

export const createCommand = defineCommand({
  meta: {
    name: "create",
    description: "Scaffold a new dimah-s3 app from an official template",
  },
  args: {
    dir: {
      type: "positional",
      description: "Project directory / name",
      required: false,
    },
    template: {
      type: "string",
      alias: "t",
      description: "Template id (e.g. nextjs)",
    },
    packageManager: {
      type: "string",
      description: "Package manager: pnpm | npm | yarn | bun",
    },
    install: {
      type: "boolean",
      description: "Install dependencies after scaffolding",
      negativeDescription: "Skip dependency installation",
    },
    git: {
      type: "boolean",
      description: "Initialize a git repository",
      negativeDescription: "Skip git init",
    },
    overwrite: {
      type: "boolean",
      description: "Allow scaffolding into a non-empty directory",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip prompts and use defaults",
      default: false,
    },
  },
  async run({ args }) {
    try {
      const flags: CreateFlags = {
        dir: typeof args.dir === "string" ? args.dir : undefined,
        template: typeof args.template === "string" ? args.template : undefined,
        packageManager:
          typeof args.packageManager === "string"
            ? args.packageManager
            : undefined,
        install: typeof args.install === "boolean" ? args.install : undefined,
        git: typeof args.git === "boolean" ? args.git : undefined,
        overwrite: Boolean(args.overwrite),
        yes: Boolean(args.yes),
      };

      const config = await resolveCreateConfig(flags);
      await runCreatePipeline(config);
    } catch (error) {
      if (error instanceof CliError) {
        if (error.exitCode !== 130) {
          logError(error.message);
        }
        process.exit(error.exitCode);
      }
      throw error;
    }
  },
});
