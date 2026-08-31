export function encodeListCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}\t${id}`, "utf8").toString(
    "base64url",
  );
}

export function decodeListCursor(
  cursor: string,
): { createdAt: Date; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("\t");
    if (sep < 1) return null;
    const createdAt = new Date(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    if (!id || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
