import { defineCommand, type ArgsDef } from "citty";

import { resolveCreateConfig } from "@/create/config";
import { runCreatePipeline } from "@/create/pipeline";
import { assertSupportedNode } from "@/runtime";
import type { CreateFlags } from "@/types";
import { assertKnownArgs } from "@/utils/args";
import { EXIT_ERROR } from "@/utils/errors";
import { withErrorBoundary } from "@/utils/exit";
import { intro } from "@/utils/ui";

const createArgs = {
  dir: {
    type: "positional",
    description: "Project directory / name",
    required: false,
  },
  template: {
    type: "string",
    alias: "t",
    description: "Template id (nextjs | vite | hono)",
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
  src: {
    type: "boolean",
    description:
      "Keep app code under src/ (Next.js / srcLayout templates only)",
    negativeDescription:
      "Flatten src/ to the project root (Next.js / srcLayout templates only)",
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
} satisfies ArgsDef;

export const createCommand = defineCommand({
  meta: {
    name: "create",
    description: "Scaffold a new dimah-s3 app from an official template",
  },
  args: createArgs,
  async run({ args, rawArgs }) {
    await withErrorBoundary(async () => {
      assertSupportedNode();
      // A typo must fail, not scaffold something else somewhere else.
      assertKnownArgs(rawArgs, createArgs);

      const flags: CreateFlags = {
        dir: typeof args.dir === "string" ? args.dir : undefined,
        template: typeof args.template === "string" ? args.template : undefined,
        packageManager:
          typeof args["package-manager"] === "string"
            ? args["package-manager"]
            : undefined,
        install: typeof args.install === "boolean" ? args.install : undefined,
        git: typeof args.git === "boolean" ? args.git : undefined,
        src: typeof args.src === "boolean" ? args.src : undefined,
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
