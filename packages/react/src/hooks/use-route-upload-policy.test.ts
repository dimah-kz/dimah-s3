import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  s3Error,
  type RouteCatalogEntry,
  type RouteCatalogResponse,
  type S3Api,
} from "@dimah-s3/core";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import {
  useRouteUploadPolicy,
  useRouteUploadPolicyState,
  type UseRouteUploadPolicyOptions,
} from "./use-route-upload-policy";

function catalogOf(
  routes: Record<string, RouteCatalogEntry["upload"]>,
): RouteCatalogResponse {
  return {
    routes: Object.fromEntries(
      Object.entries(routes).map(([route, upload]) => [
        route,
        { upload, download: { enabled: false }, delete: { enabled: false } },
      ]),
    ),
  };
}

function catalogApi(
  routes: Record<string, RouteCatalogEntry["upload"]>,
): S3Api {
  return fakeS3Api({ catalog: vi.fn(async () => catalogOf(routes)) });
}

/** Lets the catalog promise and React updates run. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 3; i += 1) await Promise.resolve();
  });
}

function mount(options: UseRouteUploadPolicyOptions) {
  return renderHook(() => useRouteUploadPolicy(options));
}

describe("useRouteUploadPolicy", () => {
  it("resolves the route's policy from the catalog", async () => {
    const api = catalogApi({
      uploads: {
        enabled: true,
        fileTypes: ["image/*"],
        maxFileSize: 1024,
        multipart: true,
        checksum: true,
      },
    });
    const hook = mount({ api, route: "uploads" });

    expect(hook.current).toEqual({
      multipart: false,
      checksum: false,
      status: "loading",
      error: null,
    });
    await flush();

    expect(hook.current).toEqual({
      accept: ["image/*"],
      maxFileSize: 1024,
      multipart: true,
      checksum: true,
      status: "ready",
      error: null,
    });
    hook.unmount();
  });

  it("narrows the route with the options and keeps the route's checksum", async () => {
    const api = catalogApi({
      uploads: {
        enabled: true,
        fileTypes: ["image/*"],
        maxFileSize: 1024,
        multipart: true,
        checksum: true,
      },
    });
    const hook = mount({
      api,
      route: "uploads",
      accept: ["image/png", "application/pdf"],
      maxFileSize: 4096,
      multipart: false,
    });
    await flush();

    expect(hook.current).toMatchObject({
      accept: ["image/png"],
      maxFileSize: 1024,
      multipart: false,
      checksum: true,
    });
    hook.unmount();
  });

  it("applies only the options when the catalog fails, with an APIError", async () => {
    const api = fakeS3Api({
      catalog: vi.fn(async () => {
        throw s3Error("FORBIDDEN");
      }),
    });
    const hook = mount({
      api,
      route: "uploads",
      accept: ["image/*"],
      maxFileSize: 2048,
    });
    await flush();

    expect(hook.current).toMatchObject({
      accept: ["image/*"],
      maxFileSize: 2048,
      multipart: false,
      checksum: false,
      status: "error",
    });
    expect(hook.current.error?.code).toBe("FORBIDDEN");
    hook.unmount();
  });

  it("turns a non-API catalog failure into UNKNOWN_ERROR", async () => {
    const cause = new Error("catalog down");
    const api = fakeS3Api({
      catalog: vi.fn(async () => {
        throw cause;
      }),
    });
    const hook = mount({ api, route: "uploads" });
    await flush();

    expect(hook.current.status).toBe("error");
    expect(hook.current.error).toMatchObject({ code: "UNKNOWN_ERROR", cause });
    hook.unmount();
  });

  it("allows nothing extra for a route with uploads disabled", async () => {
    const api = catalogApi({ uploads: { enabled: false } });
    const hook = mount({ api, route: "uploads" });
    await flush();

    expect(hook.current).toEqual({
      multipart: false,
      checksum: false,
      status: "ready",
      error: null,
    });
    hook.unmount();
  });

  it("switches routes from the cached catalog without loading again", async () => {
    const api = catalogApi({
      uploads: { enabled: true, multipart: true, checksum: false },
      docs: {
        enabled: true,
        fileTypes: [".pdf"],
        multipart: false,
        checksum: true,
      },
    });
    let route = "uploads";
    const hook = renderHook(() => useRouteUploadPolicy({ api, route }));
    await flush();

    route = "docs";
    hook.rerender();

    expect(hook.current).toMatchObject({
      accept: [".pdf"],
      multipart: false,
      checksum: true,
      status: "ready",
    });
    expect(api.catalog).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it("drops the previous API's policy while the new catalog loads", async () => {
    let api = catalogApi({
      uploads: {
        enabled: true,
        fileTypes: [".png"],
        multipart: false,
        checksum: false,
      },
    });
    const hook = renderHook(() =>
      useRouteUploadPolicy({ api, route: "uploads" }),
    );
    await flush();
    expect(hook.current.accept).toEqual([".png"]);

    api = fakeS3Api({ catalog: vi.fn(() => new Promise<never>(() => {})) });
    hook.rerender();

    expect(hook.current.status).toBe("loading");
    expect(hook.current.accept).toBeUndefined();
    hook.unmount();
  });

  it("loads the catalog again on reload after a failure", async () => {
    const catalog = vi
      .fn<S3Api["catalog"]>()
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockResolvedValue(
        catalogOf({
          uploads: { enabled: true, multipart: true, checksum: true },
        }),
      );
    const api = fakeS3Api({ catalog });
    const hook = renderHook(() =>
      useRouteUploadPolicyState({ api, route: "uploads" }),
    );
    await flush();
    expect(hook.current[0].status).toBe("error");

    act(() => {
      hook.current[1]();
    });
    expect(hook.current[0]).toMatchObject({ status: "loading", error: null });
    await flush();

    expect(hook.current[0]).toMatchObject({
      status: "ready",
      multipart: true,
      checksum: true,
    });
    expect(catalog).toHaveBeenCalledTimes(2);
    hook.unmount();
  });
});
