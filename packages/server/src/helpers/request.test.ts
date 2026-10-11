import { describe, expect, it } from "vitest";
import { requestFromDirectCall } from "./request";

describe("requestFromDirectCall", () => {
  it("copies scalar query values onto the URL", () => {
    const request = requestFromDirectCall({
      method: "DELETE",
      pathname: "/api/s3/delete",
      query: {
        route: "uploads",
        key: "avatars/org/1",
        limit: 2,
        force: false,
        skip: null,
        extra: { no: true },
        tag: ["a", "b"],
      },
    });

    const url = new URL(request.url);
    expect(url.origin).toBe("http://dimah-s3.local");
    expect(url.pathname).toBe("/api/s3/delete");
    expect(url.searchParams.get("route")).toBe("uploads");
    expect(url.searchParams.get("key")).toBe("avatars/org/1");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(url.searchParams.get("force")).toBe("false");
    expect(url.searchParams.has("skip")).toBe(false);
    expect(url.searchParams.has("extra")).toBe(false);
    expect(url.searchParams.has("tag")).toBe(false);
    expect(request.method).toBe("DELETE");
    expect(request.body).toBeNull();
  });

  it("replays a JSON body and drops a stale content-length", async () => {
    const request = requestFromDirectCall({
      method: "POST",
      pathname: "/api/s3/presign/upload",
      headers: {
        cookie: "session=abc",
        "content-type": "text/plain",
        "content-length": "1",
        "transfer-encoding": "chunked",
      },
      body: { metadata: { ownerKind: "org" } },
    });

    await expect(request.clone().json()).resolves.toEqual({
      metadata: { ownerKind: "org" },
    });
    expect(request.headers.get("content-type")).toBe("application/json");
    expect(request.headers.get("cookie")).toBe("session=abc");
    expect(request.headers.get("content-length")).toBeNull();
    expect(request.headers.get("transfer-encoding")).toBeNull();
  });

  it("does not attach a body to GET or HEAD", () => {
    const request = requestFromDirectCall({
      method: "GET",
      pathname: "/api/s3/presign/download",
      body: { route: "uploads" },
      query: { key: "uploads/a.png" },
    });

    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
    expect(new URL(request.url).searchParams.get("key")).toBe("uploads/a.png");
  });
});
