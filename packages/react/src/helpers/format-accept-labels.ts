function formatAcceptLabel(type: string): string {
  if (type.startsWith(".")) {
    const ext = type.slice(1).toLowerCase();
    return ext === "jpg" || ext === "jpeg" ? "JPEG" : ext.toUpperCase();
  }
  if (type.endsWith("/*")) {
    const base = type.slice(0, -2);
    return base.charAt(0).toUpperCase() + base.slice(1) + "s";
  }
  const sub = type.split("/")[1];
  return sub ? sub.toUpperCase() : type;
}

/** Normalizes HTML `accept` entries to short display labels (e.g. `".jpeg"` → `"JPEG"`). */
export function formatAcceptLabels(accept?: string[]): string[] {
  if (!accept?.length) return [];

  const labels: string[] = [];
  const seen = new Set<string>();

  for (const type of accept) {
    const label = formatAcceptLabel(type);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push(label);
    }
  }

  return labels;
}
