import { getDemoFileByObjectUrl } from "@/lib/demo/client-object-store";
import { throttleByteStream } from "@/lib/demo/throttle";

let installed = false;

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestSignal(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.signal) return init.signal;
  if (typeof input !== "string" && !(input instanceof URL)) return input.signal;
  return undefined;
}

function safeFileName(name: string) {
  return name.replace(/[^\w.\-() ]+/g, "_");
}

function throttledFileResponse(file: File, signal?: AbortSignal) {
  const stream = throttleByteStream(
    file.size,
    async (start, size) => {
      const buf = await file.slice(start, start + size).arrayBuffer();
      return new Uint8Array(buf);
    },
    signal,
  );

  return new Response(stream, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${safeFileName(file.name)}"`,
    },
  });
}

/** Slow blob: downloads of remembered demo files so progress UI is visible. */
export function installDemoDownloadThrottle() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const file = getDemoFileByObjectUrl(requestUrl(input));
    if (!file) return originalFetch(input, init);
    return throttledFileResponse(file, requestSignal(input, init));
  };
}
