import {
  access,
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "pathe";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Directory entries, or an empty list when the directory does not exist. */
export async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/**
 * Deletes the contents of a directory without deleting the directory itself,
 * so an in-place scaffold cannot remove the process working directory.
 */
export async function emptyDir(
  path: string,
  options: { keep?: string[] } = {},
): Promise<void> {
  const keep = new Set(options.keep ?? []);
  for (const entry of await listDir(path)) {
    if (keep.has(entry)) continue;
    await rm(join(path, entry), { recursive: true, force: true });
  }
}

export async function copyDir(src: string, dest: string): Promise<void> {
  await cp(src, dest, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

export async function readJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function renameIfExists(
  from: string,
  to: string,
): Promise<boolean> {
  if (!(await pathExists(from))) return false;
  await rename(from, to);
  return true;
}

export async function removeDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
