import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  GENERATED_ENV_KEYS,
  addGeneratedEnvPlaceholders,
  fillGeneratedEnv,
  generateSecret,
  writeProjectEnv,
} from "@/create/env";
import { pathExists } from "@/utils/fs";

const generate = () => "generated";
const SECRET_LINE = /^DIMAH_S3_SECRET="[A-Za-z0-9+/]{43}="$/m;

describe("generateSecret", () => {
  it("returns 32 random bytes as base64", () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(44);
    expect(Buffer.from(secret, "base64")).toHaveLength(32);
    expect(generateSecret()).not.toBe(secret);
  });
});

describe("fillGeneratedEnv", () => {
  it("lists DIMAH_S3_SECRET", () => {
    expect(GENERATED_ENV_KEYS).toEqual(["DIMAH_S3_SECRET"]);
  });

  it("appends a missing key after a final newline", () => {
    expect(fillGeneratedEnv("S3_BUCKET=a", { generate })).toEqual({
      content: 'S3_BUCKET=a\nDIMAH_S3_SECRET="generated"\n',
      generated: ["DIMAH_S3_SECRET"],
    });
    expect(fillGeneratedEnv("", { generate }).content).toBe(
      'DIMAH_S3_SECRET="generated"\n',
    );
  });

  it.each([
    "DIMAH_S3_SECRET=",
    'DIMAH_S3_SECRET=""',
    "DIMAH_S3_SECRET= # todo",
  ])("fills the empty assignment %s in place", (line) => {
    expect(fillGeneratedEnv(`A=1\n${line}\nB=2\n`, { generate }).content).toBe(
      'A=1\nDIMAH_S3_SECRET="generated"\nB=2\n',
    );
  });

  it("keeps the export prefix and CRLF line endings", () => {
    expect(
      fillGeneratedEnv("export DIMAH_S3_SECRET=''\r\nA=1\r\n", { generate })
        .content,
    ).toBe('export DIMAH_S3_SECRET="generated"\r\nA=1\r\n');
    expect(fillGeneratedEnv("A=1\r\n", { generate }).content).toBe(
      'A=1\r\nDIMAH_S3_SECRET="generated"\r\n',
    );
  });

  it("never overwrites a set value by default", () => {
    const content = 'DIMAH_S3_SECRET="keep-me"\n';
    expect(fillGeneratedEnv(content, { generate })).toEqual({
      content,
      generated: [],
    });
  });

  it("replaces placeholder values with keepSet: false", () => {
    expect(
      fillGeneratedEnv('DIMAH_S3_SECRET="change-me"\n', {
        generate,
        keepSet: false,
      }).content,
    ).toBe('DIMAH_S3_SECRET="generated"\n');
  });

  it("does not match a key that only shares a prefix", () => {
    expect(
      fillGeneratedEnv("DIMAH_S3_SECRET_OLD=x\n", { generate }).content,
    ).toBe('DIMAH_S3_SECRET_OLD=x\nDIMAH_S3_SECRET="generated"\n');
  });

  it("generates a real secret without a generator", () => {
    expect(fillGeneratedEnv("").content).toMatch(SECRET_LINE);
  });
});

describe("addGeneratedEnvPlaceholders", () => {
  it("appends an empty placeholder once", () => {
    const content = addGeneratedEnvPlaceholders("S3_BUCKET=a\n");
    expect(content).toBe('S3_BUCKET=a\nDIMAH_S3_SECRET=""\n');
    expect(addGeneratedEnvPlaceholders(content)).toBe(content);
  });
});

describe("writeProjectEnv", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "dimah-env-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const read = (name: string) => readFile(join(dir, name), "utf8");

  it("creates .env from .env.example with a fresh secret", async () => {
    await writeFile(
      join(dir, ".env.example"),
      'S3_BUCKET="your-bucket-name"\nDIMAH_S3_SECRET="change-me"\n',
    );

    expect(await writeProjectEnv(dir)).toEqual(["DIMAH_S3_SECRET"]);

    const env = await read(".env");
    expect(env).toMatch(/^S3_BUCKET="your-bucket-name"\n/);
    expect(env).toMatch(SECRET_LINE);
    expect(await read(".env.example")).toBe(
      'S3_BUCKET="your-bucket-name"\nDIMAH_S3_SECRET="change-me"\n',
    );
  });

  it("adds a placeholder to .env.example when it is missing", async () => {
    await writeFile(join(dir, ".env.example"), "S3_BUCKET=x\n");

    await writeProjectEnv(dir);

    expect(await read(".env.example")).toBe(
      'S3_BUCKET=x\nDIMAH_S3_SECRET=""\n',
    );
    expect(await read(".env")).toMatch(SECRET_LINE);
  });

  it("only appends to an existing .env", async () => {
    await writeFile(join(dir, ".env.example"), "S3_BUCKET=x\n");
    await writeFile(join(dir, ".env"), "S3_BUCKET=keep-me\n");

    expect(await writeProjectEnv(dir)).toEqual(["DIMAH_S3_SECRET"]);

    const env = await read(".env");
    expect(env.startsWith("S3_BUCKET=keep-me\nDIMAH_S3_SECRET=")).toBe(true);
    expect(env).toMatch(SECRET_LINE);
  });

  it("leaves a .env with a set secret untouched", async () => {
    const content = 'DIMAH_S3_SECRET="keep-me"\n';
    await writeFile(join(dir, ".env"), content);

    expect(await writeProjectEnv(dir)).toEqual([]);
    expect(await read(".env")).toBe(content);
  });

  it("creates .env when the template has no .env.example", async () => {
    await writeProjectEnv(dir);

    expect(await read(".env")).toMatch(SECRET_LINE);
    expect(await pathExists(join(dir, ".env.example"))).toBe(false);
  });
});
