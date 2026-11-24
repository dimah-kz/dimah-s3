import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { s3Error } from "@dimah-s3/core";
import type {
  ShareDownloadResponse,
  ShareListSharedResponse,
  ShareVisitorLink,
} from "@dimah-s3/share/client";
import { fireEvent, render, screen, waitFor } from "@/test/render";
import {
  SharedView,
  type SharedViewActions,
} from "@/components/dimah-s3/share/shared-view";

// jsdom has no scrolling; ObjectList scrolls a new folder to the top.
Element.prototype.scrollTo ??= () => {};

const fileLink: ShareVisitorLink = {
  type: "object",
  locked: false,
  passwordProtected: true,
  expiresAt: null,
  downloadsLeft: 2,
  object: {
    id: "o1",
    name: "report.pdf",
    size: 2048,
    contentType: "application/pdf",
    updatedAt: "2026-11-24T00:00:00.000Z",
    folderId: null,
  },
};

const folderLink: ShareVisitorLink = {
  type: "folder",
  locked: false,
  passwordProtected: false,
  expiresAt: null,
  downloadsLeft: null,
  folder: { id: "f1", name: "Drawings", parentId: null },
};

const folderPage: ShareListSharedResponse = {
  objects: [
    {
      id: "o2",
      name: "plan.dwg",
      size: 10,
      contentType: null,
      updatedAt: "2026-11-24T00:00:00.000Z",
      folderId: null,
    },
  ],
  nextCursor: null,
  folders: [],
  trail: [],
};

function sent(downloadsLeft: number | null): ShareDownloadResponse {
  return {
    url: "https://bucket.test/file?sig",
    mode: "presign",
    expiresIn: 300,
    disposition: "attachment",
    downloadsLeft,
  };
}

function fakeShare() {
  return {
    openLink: vi.fn(async () => ({ link: fileLink })),
    unlockLink: vi.fn(async () => ({
      access: "proof",
      expiresAt: "2026-11-24T01:00:00.000Z",
    })),
    listShared: vi.fn(async () => folderPage),
    downloadShared: vi.fn(async () => sent(1)),
  } satisfies SharedViewActions;
}

const assign = vi.fn();

beforeEach(() => {
  assign.mockClear();
  vi.stubGlobal("location", { assign, href: "http://localhost/s/tok" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SharedView", () => {
  it("asks for the password, then offers the file and counts down", async () => {
    const share = fakeShare();
    share.openLink.mockResolvedValueOnce({
      link: {
        type: "object",
        locked: true,
        passwordProtected: true,
        expiresAt: null,
        downloadsLeft: 2,
      },
    });
    share.unlockLink.mockRejectedValueOnce(s3Error("SHARE_PASSWORD_INVALID"));
    render(<SharedView share={share} token="tok" />);

    const password = await screen.findByLabelText("This link needs a password");
    fireEvent.change(password, { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Wrong password",
    );

    fireEvent.change(password, { target: { value: "open sesame" } });
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(
      await screen.findByRole("heading", { name: "report.pdf" }),
    ).toBeTruthy();
    expect(share.openLink).toHaveBeenLastCalledWith({
      token: "tok",
      access: "proof",
    });
    expect(screen.getByText(/2 downloads left/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await screen.findByText(/1 download left/);
    expect(share.downloadShared).toHaveBeenCalledWith(
      { token: "tok", access: "proof" },
      { signal: undefined },
    );
    expect(assign).toHaveBeenCalledWith("https://bucket.test/file?sig");
  });

  it("says why a link does not open", async () => {
    const share = fakeShare();
    share.openLink.mockRejectedValueOnce(s3Error("SHARE_LINK_EXPIRED"));
    render(<SharedView share={share} token="tok" />);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This link has expired",
    );
  });

  it("lists a shared folder from a server-opened link", async () => {
    const share = fakeShare();
    render(<SharedView share={share} token="tok" link={folderLink} />);

    expect(screen.getByRole("heading", { name: "Drawings" })).toBeTruthy();
    const download = await screen.findByRole("button", {
      name: 'Download "plan.dwg"',
    });
    expect(share.openLink).not.toHaveBeenCalled();
    fireEvent.click(download);
    await waitFor(() =>
      expect(share.downloadShared).toHaveBeenCalledWith(
        { token: "tok", id: "o2" },
        { signal: undefined },
      ),
    );
  });

  it("shows a download refusal above the file", async () => {
    const share = fakeShare();
    share.downloadShared.mockRejectedValueOnce(s3Error("SHARE_LINK_EXHAUSTED"));
    render(<SharedView share={share} token="tok" link={{ ...fileLink }} />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This link reached its download limit",
    );
  });
});
