"use client";

import { useState } from "react";
import type { ShareClientLink } from "@dimah-s3/share/client";
import { useShareLinks, type ShareLinksActions } from "@dimah-s3/share/react";
import { ShareLinkDialog } from "@dimah-s3/ui/share";
import { Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

const DAY = 86_400_000;
const NAME = "Quarterly-report.pdf";
const TARGET = { type: "object", key: "uploads/report.pdf" } as const;

function demoLink(
  id: string,
  settings: Partial<ShareClientLink> = {},
): ShareClientLink {
  const now = new Date().toISOString();
  return {
    id,
    token: `demo-${id}`,
    url: `https://app.example.com/s/demo-${id}`,
    status: "active",
    target: {
      type: "object",
      id: "report",
      key: "uploads/report.pdf",
      name: NAME,
      available: true,
    },
    label: null,
    passwordProtected: false,
    expiresAt: new Date(Date.now() + 7 * DAY).toISOString(),
    maxDownloads: null,
    downloadCount: 0,
    viewCount: 0,
    lastAccessedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    ...settings,
  };
}

/** The link the demo starts with. */
function clientLink(): ShareClientLink {
  return demoLink("client", {
    label: "For the client",
    passwordProtected: true,
    maxDownloads: 5,
    downloadCount: 2,
    viewCount: 4,
    lastAccessedAt: new Date(Date.now() - DAY).toISOString(),
  });
}

/**
 * `api.share` over an in-memory list, so the demo needs no server. The
 * clock is read in the calls, never while rendering.
 */
function demoShare(): ShareLinksActions {
  let links: ShareClientLink[] | null = null;
  let next = 0;
  const wait = () => new Promise((resolve) => setTimeout(resolve, 250));
  const expiresAt = (value: Date | string | null | undefined) =>
    value === undefined || value === null
      ? null
      : new Date(value).toISOString();

  return {
    async listLinks() {
      await wait();
      links ??= [clientLink()];
      return { links, nextCursor: null };
    },
    async createLink(input) {
      await wait();
      const link = demoLink(`link-${++next}`, {
        label: input.label ?? null,
        passwordProtected: Boolean(input.password),
        maxDownloads: input.maxDownloads ?? null,
        expiresAt: expiresAt(input.expiresAt),
      });
      links = [link, ...(links ?? [])];
      return { link };
    },
    async updateLink({ id, ...input }) {
      await wait();
      const current = links?.find((link) => link.id === id) ?? demoLink(id);
      const link: ShareClientLink = {
        ...current,
        ...(input.label !== undefined && { label: input.label }),
        ...(input.maxDownloads !== undefined && {
          maxDownloads: input.maxDownloads,
        }),
        ...(input.expiresAt !== undefined && {
          expiresAt: expiresAt(input.expiresAt),
        }),
        ...(input.password !== undefined && {
          passwordProtected: input.password !== null,
        }),
      };
      links = (links ?? []).map((row) => (row.id === id ? link : row));
      return { link };
    },
    async revokeLink({ id }) {
      await wait();
      const current = links?.find((link) => link.id === id) ?? demoLink(id);
      links = (links ?? []).filter((link) => link.id !== id);
      const revokedAt = new Date().toISOString();
      return { link: { ...current, status: "revoked", revokedAt } };
    },
  };
}

export function ShareLinkDialogDemo() {
  const [share] = useState(demoShare);
  const [open, setOpen] = useState(false);
  // The target only while open, so the links load each time it opens.
  const links = useShareLinks(share, open ? TARGET : null);
  return (
    <div className="flex justify-center">
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Share2Icon data-icon="inline-start" />
        Share {NAME}
      </Button>
      <ShareLinkDialog
        links={links}
        name={NAME}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
