/**
 * Stable client-side identity for multipart resume.
 * The S3 object key is server-generated and unknown until init.
 */
export function multipartResumeKey(route: string, file: File): string {
  return `${route}:${file.name}:${file.size}:${file.lastModified}`;
}
