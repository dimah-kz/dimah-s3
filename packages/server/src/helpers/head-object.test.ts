import { describe, expect, it, vi } from "vitest";
import { headObjectAfterMultipartComplete } from "./head-object";

describe("headObjectAfterMultipartComplete", () => {
  it("does not retry when ContentLength is 0", async () => {
    const send = vi.fn(async () => ({ ContentLength: 0 }));
    const client = { send } as never;

    await expect(
      headObjectAfterMultipartComplete(client, "bucket", "key"),
    ).resolves.toMatchObject({ ContentLength: 0 });
    expect(send).toHaveBeenCalledOnce();
  });

  it("retries while ContentLength is missing", async () => {
    vi.useFakeTimers();
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ ContentLength: 12 });
    const client = { send } as never;

    const pending = headObjectAfterMultipartComplete(client, "bucket", "key");
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ ContentLength: 12 });
    expect(send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
