import { act } from "react";
import { describe, expect, it } from "vitest";
import { useObjectUrl } from "./use-object-url";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";

describe("useObjectUrl", () => {
  it("presigns an inline URL for the key", async () => {
    const api = fakeS3Api();
    const hook = renderHook(() =>
      useObjectUrl({ api, route: "uploads", objectKey: "a.png" }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(hook.current.url).toBe("https://s3.test/dl");
    expect(api.download).toHaveBeenCalledWith({
      route: "uploads",
      key: "a.png",
      fileName: undefined,
      disposition: "inline",
    });
    expect(hook.current.isLoading).toBe(false);
    hook.unmount();
  });
});
