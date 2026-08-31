/** Sanitizes a file name for Content-Disposition, query params, and object keys. */
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/["\\\r\n\0]/g, "_");
}
