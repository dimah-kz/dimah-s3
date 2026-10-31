import { afterEach, describe, expect, it, vi } from "vitest";
import {
  readResponseBlob,
  saveBlob,
  startBrowserDownload,
} from "./browser-download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function spyOnLinkClicks() {
  const links: { href: string; download: string; attached: boolean }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    links.push({
      href: this.href,
      download: this.download,
      attached: this.isConnected,
    });
  });
  return links;
}

describe("startBrowserDownload", () => {
  it("clicks a temporary link to the URL and removes it", () => {
    const links = spyOnLinkClicks();

    startBrowserDownload("https://s3.test/dl/a.png");

    expect(links).toEqual([
      { href: "https://s3.test/dl/a.png", download: "", attached: true },
    ]);
    expect(document.querySelector("a")).toBeNull();
  });
});

describe("saveBlob", () => {
  it("downloads the blob under the file name and revokes the URL later", () => {
    vi.useFakeTimers();
    const links = spyOnLinkClicks();
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal(
      "URL",
      class extends URL {
        static override createObjectURL = createObjectURL;
        static override revokeObjectURL = revokeObjectURL;
      },
    );
    const blob = new Blob(["hi"]);

    saveBlob(blob, "a.txt");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(links).toEqual([
      { href: "blob:test", download: "a.txt", attached: true },
    ]);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });
});

describe("readResponseBlob", () => {
  it("reads the body in chunks and keeps the content type", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("hello "));
        controller.enqueue(encoder.encode("world"));
        controller.close();
      },
    });
    const onChunk = vi.fn();

    const blob = await readResponseBlob(
      new Response(body, { headers: { "content-type": "text/plain" } }),
      onChunk,
    );

    expect(await blob.text()).toBe("hello world");
    expect(blob.type).toBe("text/plain");
    expect(onChunk.mock.calls).toEqual([[6], [11]]);
  });

  it("reads a response without a body stream", async () => {
    const onChunk = vi.fn();

    const blob = await readResponseBlob(new Response(null), onChunk);

    expect(blob.size).toBe(0);
    expect(onChunk).toHaveBeenCalledWith(0);
  });
});
