import { describe, expect, it, vi } from "vitest";
import { fromNodeHeaders } from "./node";
import { toHonoHandler } from "./hono";
import { toElysiaHandler } from "./elysia";
import { toSvelteKitHandler } from "./svelte-kit";
import { toNextJsHandler } from "./next";

describe("fromNodeHeaders", () => {
  it("maps string and array header values", () => {
    const headers = fromNodeHeaders({
      host: "example.com",
      "x-forwarded-for": ["1.1.1.1", "2.2.2.2"],
      "x-empty": undefined,
    });

    expect(headers.get("host")).toBe("example.com");
    expect(headers.get("x-forwarded-for")).toBe("1.1.1.1, 2.2.2.2");
    expect(headers.has("x-empty")).toBe(false);
  });
});

describe("fetch adapters", () => {
  const request = new Request("http://localhost/api/s3/upload", {
    method: "POST",
  });
  const response = new Response(JSON.stringify({ ok: true }), { status: 200 });

  function mockS3() {
    const handler = vi.fn(async () => response);
    return { handler, s3: { handler } };
  }

  it("toHonoHandler forwards c.req.raw", async () => {
    const { handler, s3 } = mockS3();
    const result = await toHonoHandler(s3)({ req: { raw: request } });
    expect(handler).toHaveBeenCalledWith(request);
    expect(result).toBe(response);
  });

  it("toElysiaHandler forwards ctx.request", async () => {
    const { handler, s3 } = mockS3();
    const result = await toElysiaHandler(s3)({ request });
    expect(handler).toHaveBeenCalledWith(request);
    expect(result).toBe(response);
  });

  it("toSvelteKitHandler forwards event.request", async () => {
    const { handler, s3 } = mockS3();
    const result = await toSvelteKitHandler(s3)({ request });
    expect(handler).toHaveBeenCalledWith(request);
    expect(result).toBe(response);
  });

  it("toNextJsHandler exposes GET/POST/PUT/PATCH/DELETE", async () => {
    const { handler, s3 } = mockS3();
    const routes = toNextJsHandler(s3);
    await routes.GET(request);
    await routes.POST(request);
    await routes.PUT(request);
    await routes.PATCH(request);
    await routes.DELETE(request);
    expect(handler).toHaveBeenCalledTimes(5);
  });
});
