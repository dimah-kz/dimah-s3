import { describe, expect, it } from "vitest";
import { syntheticRequest } from "./request";

describe("syntheticRequest", () => {
  it("targets http://localhost plus basePath and carries the headers", () => {
    const request = syntheticRequest(
      { basePath: "/api/s3" },
      { headers: { cookie: "session=abc" } },
    );
    expect(request.url).toBe("http://localhost/api/s3");
    expect(request.method).toBe("GET");
    expect(request.body).toBeNull();
    expect(request.headers.get("cookie")).toBe("session=abc");
  });

  it("carries the call signal", () => {
    const controller = new AbortController();
    const request = syntheticRequest(
      { basePath: "/api/s3" },
      { signal: controller.signal },
    );
    controller.abort();
    expect(request.signal.aborted).toBe(true);
  });

  it("prefers baseURL", () => {
    const request = syntheticRequest({
      basePath: "/api/s3",
      baseURL: "https://app.test/api/s3",
    });
    expect(request.url).toBe("https://app.test/api/s3");
  });
});
