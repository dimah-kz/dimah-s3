export function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}
