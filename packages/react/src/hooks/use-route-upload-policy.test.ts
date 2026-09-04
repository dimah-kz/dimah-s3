import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { useRouteUploadPolicy } from "./use-route-upload-policy";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";

async function flushCatalog() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useRouteUploadPolicy", () => {
  it("fills accept from a successful catalog", async () => {
    const api = fakeS3Api({
      catalog: vi.fn(async () => ({
        routes: {
          uploads: {
            upload: {
              enabled: true as const,
              fileTypes: [".png"],
              maxFileSize: 1024,
              multipart: false,
            },
            download: { enabled: false as const },
            delete: { enabled: false as const },
          },
        },
      })),
    });
    const hook = renderHook(() =>
      useRouteUploadPolicy({ api, route: "uploads" }),
    );

    await flushCatalog();

    expect(hook.current.catalogStatus).toBe("ready");
    expect(hook.current.accept).toEqual([".png"]);
    expect(hook.current.maxFileSize).toBe(1024);
    expect(hook.current.catalogError).toBeNull();
    hook.unmount();
  });

  it("keeps explicit overrides when the catalog fails", async () => {
    const api = fakeS3Api({
      catalog: vi.fn(async () => {
        throw new Error("catalog down");
      }),
    });
    const hook = renderHook(() =>
      useRouteUploadPolicy({
        api,
        route: "uploads",
        accept: ["image/*"],
        maxFileSize: 2048,
      }),
    );

    await flushCatalog();

    expect(hook.current.catalogStatus).toBe("error");
    expect(hook.current.catalogError).toMatchObject({
      message: "catalog down",
    });
    expect(hook.current.accept).toEqual(["image/*"]);
    expect(hook.current.maxFileSize).toBe(2048);
    hook.unmount();
  });

  it("surfaces catalogError when no explicit constraints were passed", async () => {
    const api = fakeS3Api({
      catalog: vi.fn(async () => {
        throw new Error("catalog down");
      }),
    });
    const hook = renderHook(() =>
      useRouteUploadPolicy({ api, route: "uploads" }),
    );

    await flushCatalog();

    expect(hook.current.catalogStatus).toBe("error");
    expect(hook.current.catalogError?.message).toBe("catalog down");
    expect(hook.current.accept).toBeUndefined();
    hook.unmount();
  });

  it("drops the previous route policy while a new catalog is loading", async () => {
    const apiReady = fakeS3Api({
      catalog: vi.fn(async () => ({
        routes: {
          uploads: {
            upload: {
              enabled: true as const,
              fileTypes: [".png"],
              multipart: false,
            },
            download: { enabled: false as const },
            delete: { enabled: false as const },
          },
        },
      })),
    });
    const apiPending = fakeS3Api({
      catalog: vi.fn(() => new Promise<never>(() => {})),
    });
    let api = apiReady;
    let route: "uploads" | "docs" = "uploads";
    const hook = renderHook(() => useRouteUploadPolicy({ api, route }));

    await flushCatalog();
    expect(hook.current.accept).toEqual([".png"]);

    api = apiPending;
    route = "docs";
    hook.rerender();

    expect(hook.current.catalogStatus).toBe("loading");
    expect(hook.current.accept).toBeUndefined();
    hook.unmount();
  });
});
