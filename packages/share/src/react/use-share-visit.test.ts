// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import type { ShareVisitorLink, ShareVisitorOpenLink } from "@/types/client";
import { useShareVisit, type ShareVisitorActions } from "./use-share-visit";

const fileLink: ShareVisitorOpenLink = {
  type: "object",
  locked: false,
  passwordProtected: false,
  expiresAt: null,
  downloadsLeft: 3,
  object: {
    id: "f1",
    name: "a.txt",
    size: 3,
    contentType: "text/plain",
    updatedAt: "2026-11-24T00:00:00.000Z",
    folderId: null,
  },
};

const lockedLink: ShareVisitorLink = {
  type: "object",
  locked: true,
  passwordProtected: true,
  expiresAt: null,
  downloadsLeft: 3,
};

function fakeShare() {
  return {
    openLink: vi.fn(async (input: { token: string; access?: string }) => ({
      link: input.access === undefined ? lockedLink : fileLink,
    })),
    unlockLink: vi.fn(async () => ({
      access: "proof",
      expiresAt: "2026-11-24T01:00:00.000Z",
    })),
    listShared: vi.fn(async () => ({ objects: [], nextCursor: null })),
    downloadShared: vi.fn(async () => ({
      url: "https://files.test/a.txt",
      mode: "presign" as const,
      expiresIn: 60,
      disposition: "attachment" as const,
      downloadsLeft: 2,
    })),
  } satisfies ShareVisitorActions;
}

const assign = vi.fn();
beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { assign, href: "http://localhost/s/t1" });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useShareVisit", () => {
  it("opens the link, then unlocks it with the password", async () => {
    const share = fakeShare();
    const { result } = renderHook(() => useShareVisit(share, "t1"));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("locked"));
    expect(share.openLink).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.unlock("secret");
    });
    expect(share.unlockLink).toHaveBeenCalledWith({
      token: "t1",
      password: "secret",
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.access).toBe("proof");
    expect(share.openLink).toHaveBeenLastCalledWith(
      { token: "t1", access: "proof" },
      expect.anything(),
    );
  });

  it("renders a server link at once, without opening it again", async () => {
    const share = fakeShare();
    const { result } = renderHook(() =>
      useShareVisit(share, "t1", { link: fileLink }),
    );
    expect(result.current.status).toBe("ready");
    expect(result.current.link).toEqual(fileLink);
    await Promise.resolve();
    expect(share.openLink).not.toHaveBeenCalled();
  });

  it("rejects a wrong password and stays locked", async () => {
    const share = fakeShare();
    share.unlockLink.mockRejectedValueOnce(s3Error("SHARE_PASSWORD_INVALID"));
    const { result } = renderHook(() =>
      useShareVisit(share, "t1", { link: lockedLink }),
    );
    let caught: unknown;
    await act(async () => {
      await result.current.unlock("wrong").catch((error: unknown) => {
        caught = error;
      });
    });
    expect(caught).toMatchObject({ code: "SHARE_PASSWORD_INVALID" });
    expect(result.current.status).toBe("locked");
  });

  it("says why a link does not open", async () => {
    const share = fakeShare();
    share.openLink.mockRejectedValueOnce(s3Error("SHARE_LINK_EXPIRED"));
    const { result } = renderHook(() => useShareVisit(share, "t1"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error?.code).toBe("SHARE_LINK_EXPIRED");

    act(() => result.current.refresh());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("locked"));
  });

  it("downloads and counts down the downloads left", async () => {
    const share = fakeShare();
    const { result } = renderHook(() =>
      useShareVisit(share, "t1", { link: fileLink }),
    );
    await act(async () => {
      await result.current.download();
    });
    expect(share.downloadShared).toHaveBeenCalledWith(
      { token: "t1" },
      expect.anything(),
    );
    expect(assign).toHaveBeenCalledWith("https://files.test/a.txt");
    expect(result.current.link).toMatchObject({ downloadsLeft: 2 });
  });

  it("ends the visit when a download finds the link gone", async () => {
    const share = fakeShare();
    share.downloadShared.mockRejectedValueOnce(s3Error("SHARE_LINK_REVOKED"));
    const { result } = renderHook(() =>
      useShareVisit(share, "t1", { link: fileLink }),
    );
    let caught: unknown;
    await act(async () => {
      await result.current.download().catch((error: unknown) => {
        caught = error;
      });
    });
    expect(caught).toMatchObject({ code: "SHARE_LINK_REVOKED" });
    expect(result.current.status).toBe("error");
    expect(result.current.error?.code).toBe("SHARE_LINK_REVOKED");
  });

  it("keeps the visit for a download refused on its own", async () => {
    const share = fakeShare();
    share.downloadShared.mockRejectedValueOnce(
      s3Error("SHARE_TARGET_UNAVAILABLE"),
    );
    const { result } = renderHook(() =>
      useShareVisit(share, "t1", { link: fileLink }),
    );
    let caught: unknown;
    await act(async () => {
      await result.current.download("f2").catch((error: unknown) => {
        caught = error;
      });
    });
    expect(caught).toMatchObject({ code: "SHARE_TARGET_UNAVAILABLE" });
    expect(result.current.status).toBe("ready");
  });

  it("locks again when the password proof stops working", async () => {
    const share = fakeShare();
    const { result } = renderHook(() => useShareVisit(share, "t1"));
    await waitFor(() => expect(result.current.status).toBe("locked"));
    await act(async () => {
      await result.current.unlock("secret");
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    share.listShared.mockRejectedValueOnce(s3Error("SHARE_PASSWORD_REQUIRED"));
    await act(async () => {
      await result.current.source
        .query({
          parent: null,
          cursor: null,
          sort: null,
          search: "",
          signal: new AbortController().signal,
        })
        .catch(() => {});
    });
    expect(result.current.status).toBe("locked");
    expect(result.current.access).toBeUndefined();
    expect(result.current.link).toMatchObject({ locked: true, type: "object" });
  });

  it("starts over for a new token", async () => {
    const share = fakeShare();
    const { result, rerender } = renderHook(
      ({ token }: { token: string }) => useShareVisit(share, token),
      { initialProps: { token: "t1" } },
    );
    await waitFor(() => expect(result.current.status).toBe("locked"));
    rerender({ token: "t2" });
    expect(result.current.status).toBe("loading");
    expect(result.current.token).toBe("t2");
    await waitFor(() => expect(result.current.status).toBe("locked"));
    expect(share.openLink).toHaveBeenLastCalledWith(
      { token: "t2" },
      expect.anything(),
    );
  });
});
