type DemoFileEntry = {
  file: File;
  url: string;
};

const files = new Map<string, DemoFileEntry>();

/** Keep the uploaded File so homepage download can return the real bytes. */
export function rememberDemoFile(key: string, file: File) {
  const previous = files.get(key);
  if (previous) URL.revokeObjectURL(previous.url);
  files.set(key, { file, url: URL.createObjectURL(file) });
}

export function getDemoFileUrl(key: string) {
  return files.get(key)?.url ?? null;
}

export function getDemoFileByObjectUrl(url: string) {
  for (const entry of files.values()) {
    if (entry.url === url) return entry.file;
  }
  return null;
}

export function forgetDemoFile(key: string) {
  const previous = files.get(key);
  if (!previous) return;
  URL.revokeObjectURL(previous.url);
  files.delete(key);
}
