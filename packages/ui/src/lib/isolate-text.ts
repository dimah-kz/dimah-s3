/**
 * Wraps user text, such as a file name, in a first-strong isolate (FSI…PDI)
 * for plain-string copy that cannot hold `<bdi>`. The text keeps its own
 * order, and the sentence around it keeps the page direction.
 */
export function isolateText(value: string): string {
  return `⁨${value}⁩`;
}
