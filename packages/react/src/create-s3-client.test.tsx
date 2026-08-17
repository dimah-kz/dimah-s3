import { describe, expect, it } from "vitest";
import { createS3Client } from "./create-s3-client";
import { useApi } from "./s3-provider";
import { renderHook } from "./test/render-hook";

describe("createS3Client (react)", () => {
  it("returns the api plus a bound Provider and useApi", () => {
    const s3Client = createS3Client({
      fetch: async () => new Response("{}", { status: 200 }),
    });

    expect(s3Client.upload).toBeTypeOf("function");

    const hook = renderHook(() => s3Client.useApi(), {
      wrapper: ({ children }) => (
        <s3Client.Provider>{children}</s3Client.Provider>
      ),
    });
    expect(hook.current).toBe(s3Client);
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
