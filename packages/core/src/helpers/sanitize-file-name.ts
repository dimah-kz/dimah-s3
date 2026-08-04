/** Sanitizes a file name for safe use in URL query parameters. */
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/["\\\r\n]/g, "_");
}
