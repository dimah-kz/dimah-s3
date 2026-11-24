import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { s3Error } from "@dimah-s3/core";
import type { ObjectListEntry } from "@dimah-s3/react";
import type { ShareClientLink } from "@dimah-s3/share/client";
import { useShareLinks, type ShareLinksActions } from "@dimah-s3/share/react";
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
    listLinks: vi.fn(async () => ({
      links,
      nextCursor: null as string | null,
    })),
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

/** Puts `writeText` on `navigator.clipboard`. */
function stubClipboard() {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

beforeEach(() => {
  writeText.mockClear();
  stubClipboard();
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "clipboard");
});

/** The dialog over `useShareLinks`, as an app wires it. */
function Harness({
  share,
  name = "a.txt",
  linkUrl,
}: {
  share: ShareLinksActions;
  name?: string;
  linkUrl?: (token: string) => string;
}) {
  const links = useShareLinks(share, target);
  return (
    <ShareLinkDialog
      links={links}
      name={name}
      open
      onOpenChange={() => {}}
      linkUrl={linkUrl}
    />
  );
}

function renderDialog(share: ShareLinksActions) {
  return render(<Harness share={share} />);
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
    const row = (await screen.findByText("For Sam")).closest(
      "[data-slot=share-link-row]",
    );
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

    // The stock Select takes pointer events: open it, then pick the second
    // lifetime. user-event swaps the clipboard, so put the spy back.
    const user = userEvent.setup();
    stubClipboard();
    await user.click(screen.getByRole("combobox", { name: "Expires after" }));
    await user.click(await screen.findByRole("option", { name: "7 days" }));
    expect(
      screen.getByRole("combobox", { name: "Expires after" }).textContent,
    ).toContain("7 days");
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
    expect(screen.getByRole("status").textContent).toBe(
      "Link created and copied",
    );
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
    const row = screen
      .getByText("Old")
      .closest("[data-slot=share-link-row]") as HTMLElement;
    fireEvent.change(within(row).getByLabelText("Note"), {
      target: { value: "New" },
    });
    fireEvent.click(within(row).getByRole("button", { name: "Save" }));
    await screen.findByText("New");
    expect(share.updateLink).toHaveBeenCalledWith({ id: "1", label: "New" });
    // Saving closes the form and gives focus back to Change.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Change link" }),
      ),
    );

    // The confirmation is a stock AlertDialog.
    fireEvent.click(screen.getByRole("button", { name: "Turn off link" }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Turn off this link?",
    });
    // Focus starts on Cancel, as in every destructive confirm.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(confirm).getByRole("button", { name: "Cancel" }),
      ),
    );
    fireEvent.click(within(confirm).getByRole("button", { name: "Turn off" }));
    await screen.findByText("No links yet.");
    expect(share.revokeLink).toHaveBeenCalledWith({ id: "1" });
    // The row left, so focus lands on the list heading.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Links" }),
      ),
    );
    expect(screen.getByRole("status").textContent).toBe("Link turned off");
  });

  it("copies with linkUrl when share() has no url", async () => {
    const share = fakeShare([link("1", { url: null })]);
    render(
      <Harness
        share={share}
        linkUrl={(token) => `https://files.test/s/${token}`}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Copy link" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("https://files.test/s/token-1"),
    );
  });

  it("shows the URL and says when the copy failed", async () => {
    const share = fakeShare([link("1")]);
    writeText.mockRejectedValueOnce(new Error("denied"));
    renderDialog(share);
    const url = new URL("/s/token-1", location.href).href;
    expect(await screen.findByText(url)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(
      await screen.findByText(
        "Could not copy the link. Select it and copy it yourself.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe(
      "Could not copy the link",
    );
  });

  it("keeps the links when the next page fails, and tries again", async () => {
    const share = fakeShare([]);
    share.listLinks
      .mockResolvedValueOnce({ links: [link("1")], nextCursor: "c2" })
      .mockRejectedValueOnce(s3Error("NETWORK_ERROR"))
      .mockResolvedValueOnce({ links: [link("2")], nextCursor: null });
    renderDialog(share);
    fireEvent.click(await screen.findByRole("button", { name: "Show more" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Network error");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(2),
    );
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
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
