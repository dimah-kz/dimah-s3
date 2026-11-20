import type { ArgsDef } from "citty";
import { describe, expect, it } from "vitest";

import { assertKnownArgs } from "@/utils/args";
import { CliError } from "@/utils/errors";

const args = {
  dir: { type: "positional", required: false },
  template: { type: "string", alias: "t" },
  "package-manager": { type: "string" },
  install: { type: "boolean" },
  yes: { type: "boolean", alias: "y" },
} satisfies ArgsDef;

describe("assertKnownArgs", () => {
  it.each([
    [[]],
    [["my-app"]],
    [["my-app", "--template", "vite", "--yes"]],
    [["--template=vite", "my-app"]],
    [["-t", "vite", "my-app", "-y"]],
    [["-tvite", "my-app"]],
    [["-yt", "vite", "my-app"]],
    [["my-app", "--no-install"]],
    [["my-app", "--package-manager", "pnpm"]],
    [["my-app", "--packageManager", "pnpm"]],
    [["--", "my-app"]],
  ])("accepts %j", (rawArgs) => {
    expect(() => assertKnownArgs(rawArgs, args)).not.toThrow();
  });

  it.each([
    [["my-app", "--templte", "vite"], '"--templte"'],
    [["my-app", "--pm", "pnpm"], '"--pm"'],
    [["my-app", "--no-instal"], '"--no-instal"'],
    // `--no-` only negates a boolean option.
    [["my-app", "--no-template"], '"--no-template"'],
    [["my-app", "-x"], '"-x"'],
    [["my-app", "-yx"], '"-yx"'],
    [["my-app", "--version"], '"--version"'],
  ])("rejects the unknown option in %j", (rawArgs, token) => {
    expect(() => assertKnownArgs(rawArgs, args)).toThrow(CliError);
    expect(() => assertKnownArgs(rawArgs, args)).toThrow(
      `Unknown option ${token}`,
    );
  });

  it.each([
    [["my-app", "other"], '"other"'],
    // The value of a boolean option is a positional.
    [["my-app", "--yes", "please"], '"please"'],
    [["--", "my-app", "--yes"], '"--yes"'],
  ])("rejects the extra positional in %j", (rawArgs, token) => {
    expect(() => assertKnownArgs(rawArgs, args)).toThrow(
      `Unexpected argument ${token}`,
    );
  });
});
