import { defineCommand, runMain } from "citty";

import { createCommand } from "./commands/create.js";
import { cliVersion } from "./runtime.js";

const main = defineCommand({
  meta: {
    name: "dimah-s3",
    version: cliVersion(),
    description: "Official CLI for scaffolding dimah-s3 apps",
  },
  subCommands: {
    create: createCommand,
  },
});

await runMain(main);
