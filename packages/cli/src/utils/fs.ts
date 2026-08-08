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

export async function isDirEmpty(path: string): Promise<boolean> {
  if (!(await pathExists(path))) return true;
  const entries = await readdir(path);
  return entries.length === 0;
}

export async function ensureEmptyDir(
  path: string,
  overwrite: boolean,
): Promise<void> {
  if (!(await pathExists(path))) {
    await mkdir(path, { recursive: true });
    return;
  }
  if (await isDirEmpty(path)) return;
  if (!overwrite) {
    throw new Error(
      `Target directory "${path}" is not empty. Pass --overwrite to replace it.`,
    );
  }
  await rm(path, { recursive: true, force: true });
  await mkdir(path, { recursive: true });
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

export function joinPath(...parts: string[]): string {
  return join(...parts);
}
