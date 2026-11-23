import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendXhrUpload } from "./xhr-upload";

/** A minimal `XMLHttpRequest` stand-in that the test drives by hand. */
class FakeXhr {
  static last: FakeXhr | undefined;
  status = 0;
  responseText = "";
  readonly headers: Record<string, string> = {};
  readonly upload = new EventTarget();
  readonly events = new EventTarget();
  opened: { method: string; url: string } | undefined;
  body: unknown;

  constructor() {
    FakeXhr.last = this;
  }

  addEventListener(type: string, listener: () => void) {
    this.events.addEventListener(type, listener);
  }
  open(method: string, url: string) {
    this.opened = { method, url };
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.body = body;
  }
  abort() {
    this.events.dispatchEvent(new Event("abort"));
  }
  respond(status: number, responseText = "") {
    this.status = status;
    this.responseText = responseText;
    this.events.dispatchEvent(new Event("load"));
  }
}

function current(): FakeXhr {
  if (!FakeXhr.last) throw new Error("No request was sent");
  return FakeXhr.last;
}

describe("sendXhrUpload", () => {
  beforeEach(() => {
    FakeXhr.last = undefined;
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });

  it("sends the body with exactly the given headers", async () => {
    const body = new Blob(["abc"]);
    const pending = sendXhrUpload({
      method: "PUT",
      url: "https://s3.test/put",
      body,
      headers: { "content-type": "text/plain" },
    });
    const xhr = current();
    xhr.respond(200);

    await expect(pending).resolves.toBeUndefined();
    expect(xhr.opened).toEqual({ method: "PUT", url: "https://s3.test/put" });
    expect(xhr.headers).toEqual({ "content-type": "text/plain" });
    expect(xhr.body).toBe(body);
  });

  it("reports the share of the body sent", async () => {
    const onProgress = vi.fn();
    const pending = sendXhrUpload({
      method: "POST",
      url: "https://s3.test/post",
      body: new Blob(["abcd"]),
      onProgress,
    });
    const xhr = current();
    xhr.upload.dispatchEvent(
      new ProgressEvent("progress", {
        lengthComputable: true,
        loaded: 1,
        total: 4,
      }),
    );
    xhr.respond(204);
    await pending;

    expect(onProgress).toHaveBeenCalledWith(0.25);
  });

  it("rejects a non-2xx response with UPLOAD_FAILED carrying S3's status", async () => {
    const pending = sendXhrUpload({
      method: "PUT",
      url: "u",
      body: new Blob(),
    });
    current().respond(403);

    await expect(pending).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      statusCode: 403,
      params: { status: 403 },
    });
  });

  it.each(["BadDigest", "XAmzContentChecksumMismatch"])(
    "rejects a 400 %s response with CHECKSUM_MISMATCH",
    async (code) => {
      const pending = sendXhrUpload({
        method: "PUT",
        url: "u",
        body: new Blob(),
      });
      current().respond(
        400,
        `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>m</Message></Error>`,
      );

      await expect(pending).rejects.toMatchObject({
        code: "CHECKSUM_MISMATCH",
        statusCode: 400,
      });
    },
  );

  it.each([
    ["another S3 code", "<Error><Code>InvalidDigest</Code></Error>"],
    ["an empty body", ""],
  ])("keeps UPLOAD_FAILED for a 400 with %s", async (_label, body) => {
    const pending = sendXhrUpload({
      method: "PUT",
      url: "u",
      body: new Blob(),
    });
    current().respond(400, body);

    await expect(pending).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      params: { status: 400 },
    });
  });

  it("keeps UPLOAD_FAILED when the body cannot be read", async () => {
    const pending = sendXhrUpload({
      method: "PUT",
      url: "u",
      body: new Blob(),
    });
    const xhr = current();
    Object.defineProperty(xhr, "responseText", {
      get() {
        throw new DOMException("Not readable", "InvalidStateError");
      },
    });
    xhr.status = 400;
    xhr.events.dispatchEvent(new Event("load"));

    await expect(pending).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
      params: { status: 400 },
    });
  });

  it("rejects a failed request with NETWORK_ERROR", async () => {
    const pending = sendXhrUpload({
      method: "PUT",
      url: "u",
      body: new Blob(),
    });
    current().events.dispatchEvent(new Event("error"));

    await expect(pending).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("aborts the request and rejects with the signal's reason", async () => {
    const controller = new AbortController();
    const reason = new DOMException("cancel", "AbortError");
    const pending = sendXhrUpload({
      method: "PUT",
      url: "u",
      body: new Blob(),
      signal: controller.signal,
    });
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });

  it("does not send when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      sendXhrUpload({
        method: "PUT",
        url: "u",
        body: new Blob(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last).toBeUndefined();
  });
});
