"use client";

import { useState } from "react";
import { s3Error } from "@dimah-s3/core";
import type {
  ShareListSharedInput,
  ShareVisitorFolder,
  ShareVisitorObject,
} from "@dimah-s3/share/client";
import { SharedView, type SharedViewActions } from "@dimah-s3/ui/share";

const PASSWORD = "demo";
const ROOT: ShareVisitorFolder = {
  id: "drawings",
  name: "Project drawings",
  parentId: null,
};
const FOLDERS: ShareVisitorFolder[] = [
  { id: "details", name: "Details", parentId: null },
];
const FILES: ShareVisitorObject[] = [
  {
    id: "plan",
    name: "Ground-floor-plan.pdf",
    size: 3_145_728,
    contentType: "application/pdf",
    updatedAt: "2026-11-02T10:00:00.000Z",
    folderId: null,
  },
  {
    id: "render",
    name: "Courtyard-render.png",
    size: 1_572_864,
    contentType: "image/png",
    updatedAt: "2026-11-10T10:00:00.000Z",
    folderId: null,
  },
  {
    id: "stair",
    name: "Stair-section.dwg",
    size: 524_288,
    contentType: null,
    updatedAt: "2026-10-28T10:00:00.000Z",
    folderId: "details",
  },
];

/** The visitor actions of one password-protected folder link, in memory. */
function demoShare(): SharedViewActions {
  let downloadsLeft = 10;
  const wait = () => new Promise((resolve) => setTimeout(resolve, 200));
  // Read in the calls, never while rendering.
  const expiresAt = () => new Date(Date.now() + 5 * 86_400_000).toISOString();
  return {
    async openLink({ access }) {
      await wait();
      const base = {
        passwordProtected: true,
        expiresAt: expiresAt(),
        downloadsLeft,
      };
      return access === "demo-access"
        ? { link: { ...base, type: "folder", locked: false, folder: ROOT } }
        : { link: { ...base, type: "folder", locked: true } };
    },
    async unlockLink({ password }) {
      await wait();
      if (password !== PASSWORD) throw s3Error("SHARE_PASSWORD_INVALID");
      return { access: "demo-access", expiresAt: expiresAt() };
    },
    async listShared(input: ShareListSharedInput) {
      await wait();
      const folderId = input.folderId || null;
      const search = input.search?.toLowerCase();
      const objects = FILES.filter((file) =>
        search
          ? file.name.toLowerCase().includes(search)
          : file.folderId === folderId,
      );
      return {
        objects,
        nextCursor: null,
        folders: search || folderId ? [] : FOLDERS,
        trail: FOLDERS.filter((folder) => folder.id === folderId),
      };
    },
    async downloadShared() {
      await wait();
      if (downloadsLeft === 0) throw s3Error("SHARE_LINK_EXHAUSTED");
      downloadsLeft -= 1;
      return {
        // A real link sends the browser to a short-lived file URL.
        url: "#shared-view-demo",
        mode: "presign",
        expiresIn: 300,
        disposition: "attachment",
        downloadsLeft,
      };
    },
  };
}

export function SharedViewDemo() {
  const [share] = useState(demoShare);
  return (
    <div id="shared-view-demo" className="flex w-full flex-col gap-3">
      <p className="text-sm text-fd-muted-foreground">
        The password is <code>{PASSWORD}</code>.
      </p>
      <SharedView share={share} token="demo" height="20rem" />
    </div>
  );
}
