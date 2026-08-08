import { mkdtemp, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { emptyDir } from "../utils/fs.js";

describe("emptyDir", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) {
      await rm(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  it("removes all entries", async () => {
    dir = await mkdtemp(join(tmpdir(), "dimah-empty-"));
    await writeFile(join(dir, "a.txt"), "a", "utf8");
    await mkdir(join(dir, "nested"));
    await writeFile(join(dir, "nested", "b.txt"), "b", "utf8");

    await emptyDir(dir);

    expect(await readdir(dir)).toEqual([]);
  });

  it("keeps listed entries", async () => {
    dir = await mkdtemp(join(tmpdir(), "dimah-empty-keep-"));
    await mkdir(join(dir, ".git"));
    await writeFile(join(dir, ".env"), "SECRET=1\n", "utf8");
    await writeFile(join(dir, "stale.txt"), "old", "utf8");

    await emptyDir(dir, { keep: [".git", ".env"] });

    expect((await readdir(dir)).sort()).toEqual([".env", ".git"]);
  });
});
