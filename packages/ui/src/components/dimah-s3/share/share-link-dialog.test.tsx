import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import type { ObjectListEntry } from "@dimah-s3/react";
import type { ShareClientLink } from "@dimah-s3/share/client";
import type { ShareLinksActions } from "@dimah-s3/share/react";
import { fireEvent, render, screen, waitFor, within } from "@/test/render";
import {
  ShareLinkDialog,
  shareTargetOf,
} from "@/components/dimah-s3/share/share-link-dialog";

function link(id: string, extra: Partial<ShareClientLink> = {}) {
  return {
    id,
    token: `token-${id}`,
    url: `/s/token-${id}`,
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
    expiresAt: "2026-12-01T00:00:00.000Z",
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

function fakeShare(links: ShareClientLink[]) {
  return {
    listLinks: vi.fn(async () => ({ links, nextCursor: null })),
    createLink: vi.fn(async (input: { label?: string | null }) => ({
      link: link("new", { label: input.label ?? null }),
    })),
    updateLink: vi.fn(async (input: { id: string; label?: string | null }) => ({
      link: link(input.id, { label: input.label ?? null }),
    })),
    revokeLink: vi.fn(async ({ id }: { id: string }) => ({
      link: link(id, { status: "revoked" }),
    })),
  } satisfies ShareLinksActions;
}

const target = { type: "object", key: "a.txt" } as const;
const writeText = vi.fn(async (_text: string) => {});

beforeEach(() => {
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

function renderDialog(share: ShareLinksActions) {
  return render(
    <ShareLinkDialog
      share={share}
      target={target}
      name="a.txt"
      open
      onOpenChange={() => {}}
    />,
  );
}

describe("ShareLinkDialog", () => {
  it("lists the target's links with their counts", async () => {
    const share = fakeShare([
      link("1", {
        label: "For Sam",
        passwordProtected: true,
        maxDownloads: 5,
        downloadCount: 2,
        viewCount: 3,
      }),
    ]);
    renderDialog(share);

    expect(
      screen.getByRole("dialog", { name: 'Share "⁨a.txt⁩"' }),
    ).toBeTruthy();
    const row = (await screen.findByText("For Sam")).closest("li");
    expect(row).not.toBeNull();
    const inRow = within(row as HTMLElement);
    expect(inRow.getByText("Active")).toBeTruthy();
    expect(inRow.getByRole("img", { name: "Needs a password" })).toBeTruthy();
    expect(inRow.getByText(/2 of 5 downloads · 3 views/)).toBeTruthy();
    expect(share.listLinks).toHaveBeenCalledWith(
      { target, includeRevoked: false, limit: 100 },
      expect.anything(),
    );
  });

  it("creates a link from the form and copies it", async () => {
    const share = fakeShare([]);
    renderDialog(share);
    await screen.findByText("No links yet.");

    fireEvent.change(screen.getByLabelText("Expires after"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByLabelText("Download limit"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Client" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const [input] = share.createLink.mock.calls[0] ?? [];
    expect(input).toMatchObject({ target, maxDownloads: 3, label: "Client" });
    const lifetime =
      Date.parse(String((input as { expiresAt?: string }).expiresAt)) -
      Date.now();
    expect(lifetime).toBeGreaterThan(6.9 * 86_400_000);
    expect(writeText).toHaveBeenCalledWith(
      new URL("/s/token-new", location.href).href,
    );
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText("Client")).toBeTruthy();
    expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("");
  });

  it("says why a link could not be created", async () => {
    const share = fakeShare([]);
    share.createLink.mockRejectedValueOnce(
      s3Error("SHARE_FOLDER_LINKS_DISABLED"),
    );
    renderDialog(share);
    await screen.findByText("No links yet.");
    fireEvent.click(screen.getByRole("button", { name: "Create link" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Folder links are turned off",
    );
  });

  it("changes only what the form changed, and turns a link off", async () => {
    const share = fakeShare([link("1", { label: "Old", maxDownloads: 4 })]);
    renderDialog(share);
    await screen.findByText("Old");

    fireEvent.click(screen.getByRole("button", { name: "Change link" }));
    const row = screen.getByText("Old").closest("li") as HTMLElement;
    fireEvent.change(within(row).getByLabelText("Note"), {
      target: { value: "New" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Save" }));
    await screen.findByText("New");
    expect(share.updateLink).toHaveBeenCalledWith({ id: "1", label: "New" });

    fireEvent.click(screen.getByRole("button", { name: "Turn off link" }));
    expect(
      screen.getByText("Anyone who has this link can no longer open it."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await screen.findByText("No links yet.");
    expect(share.revokeLink).toHaveBeenCalledWith({ id: "1" });
  });

  it("copies with linkUrl when share() has no url", async () => {
    const share = fakeShare([link("1", { url: null })]);
    render(
      <ShareLinkDialog
        share={share}
        target={target}
        open
        onOpenChange={() => {}}
        linkUrl={(token) => `https://files.test/s/${token}`}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://files.test/s/token-1"),
    );
  });
});

describe("shareTargetOf", () => {
  it("names a file by its object key and a folder by its id", () => {
    const file = {
      kind: "file",
      key: "file:1",
      id: "1",
      name: "a.txt",
      item: {},
      file: { name: "a.txt", objectKey: "user/a.txt" },
    } satisfies ObjectListEntry<object>;
    const folder = {
      kind: "folder",
      key: "folder:f1",
      id: "f1",
      name: "Docs",
      folder: { id: "f1", name: "Docs" },
    } satisfies ObjectListEntry<object>;
    expect(shareTargetOf(file, { bucket: "b" })).toEqual({
      type: "object",
      key: "user/a.txt",
      bucket: "b",
    });
    expect(shareTargetOf(folder)).toEqual({ type: "folder", folderId: "f1" });
  });
});
