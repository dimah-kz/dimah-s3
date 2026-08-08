import { defineCommand } from "citty";

import { resolveCreateConfig } from "../create/config.js";
import { runCreatePipeline } from "../create/pipeline.js";
import { assertSupportedNode } from "../runtime.js";
import type { CreateFlags } from "../types.js";
import { EXIT_ERROR } from "../utils/errors.js";
import { withErrorBoundary } from "../utils/exit.js";
import { intro } from "../utils/ui.js";

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
    "package-manager": {
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
      description: "Replace the contents of a non-empty directory",
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
    await withErrorBoundary(async () => {
      assertSupportedNode();

      const flags: CreateFlags = {
        dir: typeof args.dir === "string" ? args.dir : undefined,
        template: typeof args.template === "string" ? args.template : undefined,
        packageManager:
          typeof args["package-manager"] === "string"
            ? args["package-manager"]
            : undefined,
        install: typeof args.install === "boolean" ? args.install : undefined,
        git: typeof args.git === "boolean" ? args.git : undefined,
        overwrite: Boolean(args.overwrite),
        yes: Boolean(args.yes),
      };

      intro();
      const resolved = await resolveCreateConfig(flags);
      const { failedSteps } = await runCreatePipeline(resolved);

      // The project is usable, but a skipped step must not look like success.
      if (failedSteps.length > 0) {
        process.exitCode = EXIT_ERROR;
      }
    });
  },
});
