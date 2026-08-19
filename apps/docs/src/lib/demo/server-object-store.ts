export type StoredDemoObject = {
  body: Uint8Array;
  contentType: string;
};

const globalForDemo = globalThis as typeof globalThis & {
  __dimahDemoObjects?: Map<string, StoredDemoObject>;
};

const objects = (globalForDemo.__dimahDemoObjects ??= new Map());

export function saveUploadedObject(key: string, object: StoredDemoObject) {
  objects.set(key, object);
}

export function getUploadedObject(key: string) {
  return objects.get(key);
}

export function deleteUploadedObject(key: string) {
  objects.delete(key);
}
