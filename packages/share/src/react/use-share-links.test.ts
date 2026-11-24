// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import type {
  ShareClientLink,
  ShareListLinksInput,
  ShareTargetInput,
} from "@/types/client";
import { useShareLinks, type ShareLinksActions } from "./use-share-links";

function link(id: string, extra: Partial<ShareClientLink> = {}) {
  return {
    id,
    token: `token-${id}`,
    url: `https://app.test/s/token-${id}`,
    status: "active",
    target: {
      type: "object",
      id: "o1",
      key: "a.txt",
      name: "a.txt",
      available: true,
    },
    label: null,
    passwordProtected: false,
    expiresAt: null,
    maxDownloads: null,
    downloadCount: 0,
    viewCount: 0,
    lastAccessedAt: null,
    revokedAt: null,
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
    ...extra,
  } satisfies ShareClientLink;
}

/** A fake `api.share` whose pages come from `pages`, keyed by cursor. */
function fakeShare(pages: Record<string, ShareClientLink[]> = {}) {
  const listLinks = vi.fn(async (input?: ShareListLinksInput) => {
    const cursor = input?.cursor ?? "";
    const next = cursor === "" && pages.second ? "second" : null;
    return { links: pages[cursor] ?? [], nextCursor: next };
  });
  const share = {
    listLinks,
    createLink: vi.fn(async () => ({ link: link("new") })),
    updateLink: vi.fn(async (input: { id: string; label?: string | null }) => ({
      link: link(input.id, { label: input.label ?? null }),
    })),
    revokeLink: vi.fn(async ({ id }: { id: string }) => ({
      link: link(id, { status: "revoked", revokedAt: "2026-11-24T01:00:00Z" }),
    })),
  } satisfies ShareLinksActions;
  return share;
}

const file: ShareTargetInput = { type: "object", key: "a.txt" };

describe("useShareLinks", () => {
  it("waits without a target, then loads the target's links", async () => {
    const share = fakeShare({ "": [link("1")] });
    const { result, rerender } = renderHook(
      ({ target }: { target: ShareTargetInput | null }) =>
        useShareLinks(share, target),
      { initialProps: { target: null as ShareTargetInput | null } },
    );
    expect(result.current.status).toBe("idle");
    expect(share.listLinks).not.toHaveBeenCalled();

    rerender({ target: file });
    expect(result.current.status).toBe("loading");
    expect(result.current.isLoading).toBe(true);
    expect(result.current.target).toEqual(file);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.links.map((row) => row.id)).toEqual(["1"]);
    expect(share.listLinks).toHaveBeenCalledWith(
      { target: file, includeRevoked: false, limit: 100 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    // A new object for the same target does not load again.
    rerender({ target: { type: "object", key: "a.txt" } });
    expect(share.listLinks).toHaveBeenCalledTimes(1);
  });

  it("creates, changes, and revokes links in place", async () => {
    const share = fakeShare({ "": [link("1")] });
    const { result } = renderHook(() => useShareLinks(share, file));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.create({ maxDownloads: 3 });
    });
    expect(share.createLink).toHaveBeenCalledWith({
      maxDownloads: 3,
      target: file,
    });
    expect(result.current.links.map((row) => row.id)).toEqual(["new", "1"]);

    await act(async () => {
      await result.current.update("1", { label: "For Sam" });
    });
    expect(result.current.links[1]?.label).toBe("For Sam");

    await act(async () => {
      await result.current.revoke("1");
    });
    expect(result.current.links.map((row) => row.id)).toEqual(["new"]);
  });

  it("keeps a revoked link with includeRevoked", async () => {
    const share = fakeShare({ "": [link("1")] });
    const { result } = renderHook(() =>
      useShareLinks(share, file, { includeRevoked: true }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(async () => {
      await result.current.revoke("1");
    });
    expect(result.current.links).toMatchObject([
      { id: "1", status: "revoked" },
    ]);
  });

  it("pages with loadMore and reports a failed load", async () => {
    const share = fakeShare({ "": [link("1")], second: [link("2")] });
    const { result } = renderHook(() => useShareLinks(share, file));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    // A second loadMore while the first is on its way is ignored.
    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.loadMore();
      void result.current.loadMore();
    });
    expect(result.current.status).toBe("loading-more");
    expect(result.current.isLoadingMore).toBe(true);
    await act(async () => {
      await first;
    });
    expect(share.listLinks).toHaveBeenCalledTimes(2);
    expect(result.current.links.map((row) => row.id)).toEqual(["1", "2"]);
    expect(result.current.hasMore).toBe(false);

    // A failed reload keeps the rows and says why, as an APIError.
    share.listLinks.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe("UNKNOWN_ERROR");
    expect(result.current.links.map((row) => row.id)).toEqual(["1", "2"]);

    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.error).toBeNull();
  });

  it("keeps the loaded links when the next page fails, and retries it", async () => {
    const share = fakeShare({ "": [link("1")], second: [link("2")] });
    const { result } = renderHook(() => useShareLinks(share, file));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    const failure = s3Error("NETWORK_ERROR");
    share.listLinks.mockRejectedValueOnce(failure);
    await act(async () => {
      await result.current.loadMore();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(failure);
    expect(result.current.links.map((row) => row.id)).toEqual(["1"]);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.retry();
    });
    expect(share.listLinks).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: "second" }),
      expect.anything(),
    );
    expect(result.current.links.map((row) => row.id)).toEqual(["1", "2"]);
  });

  it("shows nothing when the first page fails", async () => {
    const share = fakeShare();
    share.listLinks.mockRejectedValueOnce(s3Error("UNAUTHORIZED"));
    const { result } = renderHook(() => useShareLinks(share, file));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("UNAUTHORIZED");
    expect(result.current.links).toEqual([]);
  });

  it("rejects a failed change with an APIError and keeps the rows", async () => {
    const share = fakeShare({ "": [link("1")] });
    share.updateLink.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useShareLinks(share, file));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await expect(
      act(() => result.current.update("1", { label: "x" })),
    ).rejects.toMatchObject({ code: "UNKNOWN_ERROR" });
    expect(result.current.links.map((row) => row.id)).toEqual(["1"]);
  });

  it("drops the answer for a target it left", async () => {
    let answer: (links: ShareClientLink[]) => void = () => {};
    const share = fakeShare();
    share.listLinks.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = (links) => resolve({ links, nextCursor: null });
        }),
    );
    const { result, rerender } = renderHook(
      ({ target }: { target: ShareTargetInput }) =>
        useShareLinks(share, target),
      { initialProps: { target: file as ShareTargetInput } },
    );
    await waitFor(() => expect(share.listLinks).toHaveBeenCalledTimes(1));
    rerender({ target: { type: "folder", folderId: "f1" } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => answer([link("stale")]));
    expect(result.current.links).toEqual([]);
  });
});
