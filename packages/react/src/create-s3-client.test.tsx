import { describe, expect, it } from "vitest";
import { createS3Client } from "./create-s3-client";
import { useApi } from "./s3-provider";
import { renderHook } from "./test/render-hook";

describe("createS3Client (react)", () => {
  it("returns a bound provider and useApi", () => {
    const {
      api,
      S3Provider,
      useApi: useBoundApi,
    } = createS3Client({
      fetch: async () => new Response("{}", { status: 200 }),
    });

    expect(api.upload).toBeTypeOf("function");

    const hook = renderHook(() => useBoundApi(), {
      wrapper: ({ children }) => <S3Provider>{children}</S3Provider>,
    });
    expect(hook.current).toBe(api);
    hook.unmount();
  });

  it("throws useApi outside a provider", () => {
    const hook = renderHook(() => {
      try {
        return useApi();
      } catch (err) {
        return err as Error;
      }
    });
    expect(hook.current).toMatchObject({
      message: expect.stringContaining("No S3Api found"),
    });
    hook.unmount();
  });
});
