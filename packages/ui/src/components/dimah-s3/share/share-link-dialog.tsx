"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  useFormatDate,
  useFormatError,
  useFormatNumber,
  type ObjectListEntry,
} from "@dimah-s3/react";
import type {
  ShareClientLink,
  ShareLinkStatus,
  ShareTargetInput,
} from "@dimah-s3/share/client";
import {
  useShareLinks,
  type ShareLinksActions,
  type UseShareLinksReturn,
} from "@dimah-s3/share/react";
import { useTranslations } from "@fuma-translate/react";
import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PowerOffIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  DEFAULT_SHARE_EXPIRY_OPTIONS,
  draftSettings,
  linkDraft,
  newLinkDraft,
  ShareLinkFields,
  type ShareLinkDraft,
  type ShareLinkFieldsOptions,
} from "@/components/dimah-s3/share/share-link-fields";
import { isolateText } from "@/lib/isolate-text";

/** How long a row shows "Copied", in milliseconds. */
const COPIED_MS = 2000;

/** Props of {@link ShareLinkDialog}. */
export type ShareLinkDialogProps = {
  /** `api.share` from a client with `shareClient()`. */
  share: ShareLinksActions;
  /**
   * The object or folder whose links the dialog shows. Build it from an
   * `ObjectList` row with {@link shareTargetOf}.
   */
  target: ShareTargetInput | null;
  /** The name of the object or folder, for the title. */
  name?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Lifetimes a new link can pick, in seconds, the first one selected.
   * `null` never expires, unless `share()` sets `expiration.max`.
   * @default [86400, 604800, 2592000] (1, 7, and 30 days)
   */
  expiryOptions?: readonly (number | null)[];
  /**
   * The URL of a link, from its token, when `share()` has no `url`. A
   * relative URL resolves against the page.
   */
  linkUrl?: (token: string) => string;
  /** Turn off the password, download limit, or note field. */
  fields?: ShareLinkFieldsOptions;
};

/**
 * The share target of an `ObjectList` row: its object key for a file, its
 * id for a folder. Pass `bucket` when the routes use several buckets.
 */
export function shareTargetOf<TItem>(
  entry: ObjectListEntry<TItem>,
  options: { bucket?: string } = {},
): ShareTargetInput {
  if (entry.kind === "folder") return { type: "folder", folderId: entry.id };
  return {
    type: "object",
    key: entry.file.objectKey ?? entry.id,
    ...(options.bucket !== undefined && { bucket: options.bucket }),
  };
}

/** The absolute URL of a link, or `null` when there is no page to point at. */
function linkHref(
  link: ShareClientLink,
  linkUrl: ShareLinkDialogProps["linkUrl"],
): string | null {
  const raw = link.url ?? linkUrl?.(link.token) ?? null;
  if (raw === null) return null;
  return new URL(raw, globalThis.location?.href ?? "http://localhost").href;
}

/**
 * An owner's dialog for the share links of one object or folder: create a
 * link with a lifetime, an optional password, download limit, and note,
 * copy it, and see, change, or turn off the links it already has. It loads
 * the links each time it opens, with `useShareLinks` from
 * `@dimah-s3/share/react`.
 *
 * ```tsx
 * const [sharing, setSharing] = useState<ObjectListEntry<DbClientObject>>();
 *
 * <ShareLinkDialog
 *   share={api.share}
 *   target={sharing ? shareTargetOf(sharing) : null}
 *   name={sharing?.name}
 *   open={sharing !== undefined}
 *   onOpenChange={(open) => !open && setSharing(undefined)}
 * />
 * ```
 */
export function ShareLinkDialog({
  share,
  target,
  name,
  open,
  onOpenChange,
  expiryOptions = DEFAULT_SHARE_EXPIRY_OPTIONS,
  linkUrl,
  fields,
}: ShareLinkDialogProps) {
  // Keep the last target and name while the dialog animates out.
  const [shown, setShown] = useState({ target, name });
  if (target !== null && (target !== shown.target || name !== shown.name)) {
    setShown({ target, name });
  }
  const current = target ?? shown.target;

  return (
    <Dialog open={open && current !== null} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="share-link-dialog"
        // A translated Close in the footer stands for the stock corner button.
        showCloseButton={false}
        className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-4 overflow-y-auto bg-dimah-s3-card text-dimah-s3-card-foreground ring-dimah-s3-foreground/10 sm:max-w-lg"
      >
        {current ? (
          <SharePanel
            share={share}
            target={current}
            name={target === null ? shown.name : name}
            expiryOptions={expiryOptions}
            linkUrl={linkUrl}
            fields={fields}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The dialog's content. Mounted while the dialog is open, so it loads each time. */
function SharePanel({
  share,
  target,
  name,
  expiryOptions,
  linkUrl,
  fields,
}: Omit<ShareLinkDialogProps, "open" | "onOpenChange" | "target"> & {
  target: ShareTargetInput;
  expiryOptions: readonly (number | null)[];
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatNumber = useFormatNumber();
  const links = useShareLinks(share, target);
  const headingId = useId();
  const [draft, setDraft] = useState<ShareLinkDraft>(newLinkDraft);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function copy(link: ShareClientLink) {
    const href = linkHref(link, linkUrl);
    if (href === null) return;
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      return;
    }
    setCopied(link.id);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const link = await links.create(draftSettings(draft, expiryOptions));
      setDraft(newLinkDraft());
      await copy(link);
    } catch (caught) {
      setError(caught);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <DialogHeader className="gap-1">
        <DialogTitle className="leading-snug [overflow-wrap:anywhere]">
          {name
            ? t('Share "{name}"', {
                note: "share link dialog",
                variables: { name: isolateText(name) },
              })
            : t("Share", { note: "share link dialog" })}
        </DialogTitle>
        <DialogDescription className="text-dimah-s3-muted-foreground">
          {target.type === "folder"
            ? t(
                "Anyone with a link can open this folder and download its files until the link expires or you turn it off.",
                { note: "share link dialog" },
              )
            : t(
                "Anyone with a link can download this file until the link expires or you turn it off.",
                { note: "share link dialog" },
              )}
        </DialogDescription>
      </DialogHeader>

      <form className="flex flex-col gap-3" onSubmit={(e) => void onCreate(e)}>
        <ShareLinkFields
          draft={draft}
          onChange={setDraft}
          expiryOptions={expiryOptions}
          fields={fields}
          disabled={creating}
        />
        {error != null ? (
          <p
            role="alert"
            className="text-sm [overflow-wrap:anywhere] text-dimah-s3-destructive"
          >
            {formatError(error)}
          </p>
        ) : null}
        <Button
          type="submit"
          className="self-end pointer-coarse:h-10"
          disabled={creating}
          aria-busy={creating || undefined}
        >
          {creating ? (
            <Spinner
              data-icon="inline-start"
              aria-hidden
              aria-label={undefined}
              role={undefined}
            />
          ) : (
            <LinkIcon data-icon="inline-start" />
          )}
          {t("Create link", { note: "share link dialog" })}
        </Button>
      </form>

      <section
        aria-labelledby={headingId}
        className="flex flex-col gap-2 border-t border-dimah-s3-border pt-3"
      >
        <h3
          id={headingId}
          className="text-sm font-medium text-dimah-s3-foreground"
        >
          {links.status === "success" && links.links.length > 0
            ? t("Links ({count})", {
                note: "share link dialog",
                variables: { count: formatNumber(links.links.length) },
              })
            : t("Links", { note: "share link dialog" })}
        </h3>
        <LinkList
          links={links}
          linkUrl={linkUrl}
          expiryOptions={expiryOptions}
          fields={fields}
          copied={copied}
          onCopy={(link) => void copy(link)}
        />
      </section>

      <DialogFooter className="border-dimah-s3-border bg-dimah-s3-muted/50">
        <DialogClose
          render={<Button variant="outline" className="pointer-coarse:h-10" />}
        >
          {t("Close", { note: "dialog button" })}
        </DialogClose>
      </DialogFooter>
    </>
  );
}

function LinkList({
  links,
  linkUrl,
  expiryOptions,
  fields,
  copied,
  onCopy,
}: {
  links: UseShareLinksReturn;
  linkUrl: ShareLinkDialogProps["linkUrl"];
  expiryOptions: readonly (number | null)[];
  fields: ShareLinkFieldsOptions | undefined;
  copied: string | null;
  onCopy: (link: ShareClientLink) => void;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const [loadingMore, setLoadingMore] = useState(false);

  if (links.status === "loading" || links.status === "idle") {
    return (
      <p className="flex items-center gap-2 text-sm text-dimah-s3-muted-foreground">
        <Spinner aria-hidden aria-label={undefined} role={undefined} />
        {t("Loading links", { note: "share link dialog" })}
      </p>
    );
  }
  if (links.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p
          role="alert"
          className="text-sm [overflow-wrap:anywhere] text-dimah-s3-destructive"
        >
          {formatError(links.error)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void links.refresh()}
        >
          {t("Try again", { note: "share link dialog" })}
        </Button>
      </div>
    );
  }
  if (links.links.length === 0) {
    return (
      <p className="text-sm text-dimah-s3-muted-foreground">
        {t("No links yet.", { note: "share link dialog" })}
      </p>
    );
  }
  return (
    <>
      <ul className="flex flex-col gap-2">
        {links.links.map((link) => (
          <LinkRow
            key={link.id}
            link={link}
            links={links}
            href={linkHref(link, linkUrl)}
            expiryOptions={expiryOptions}
            fields={fields}
            copied={copied === link.id}
            onCopy={() => onCopy(link)}
          />
        ))}
      </ul>
      {links.hasMore ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={loadingMore}
          onClick={() => {
            setLoadingMore(true);
            void links.loadMore().finally(() => setLoadingMore(false));
          }}
        >
          {t("Show more", { note: "share link dialog" })}
        </Button>
      ) : null}
    </>
  );
}

/** One link: its status and counts, and Copy, Change, and Turn off. */
function LinkRow({
  link,
  links,
  href,
  expiryOptions,
  fields,
  copied,
  onCopy,
}: {
  link: ShareClientLink;
  links: UseShareLinksReturn;
  href: string | null;
  expiryOptions: readonly (number | null)[];
  fields: ShareLinkFieldsOptions | undefined;
  copied: boolean;
  onCopy: () => void;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatDate = useFormatDate();
  const formatNumber = useFormatNumber();
  const [mode, setMode] = useState<"view" | "edit" | "revoke">("view");
  const [draft, setDraft] = useState<ShareLinkDraft>(() => linkDraft(link));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const revoked = link.status === "revoked";
  const date = (value: string) => formatDate(value, { dateStyle: "medium" });

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      setMode("view");
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const facts = [
    link.expiresAt === null
      ? t("Never expires", { note: "share link expiry" })
      : link.status === "expired"
        ? t("Expired {date}", {
            note: "share link facts",
            variables: { date: date(link.expiresAt) },
          })
        : t("Expires {date}", {
            note: "share link facts",
            variables: { date: date(link.expiresAt) },
          }),
    link.maxDownloads === null
      ? link.downloadCount === 1
        ? t("1 download", { note: "share link facts" })
        : t("{count} downloads", {
            note: "share link facts",
            variables: { count: formatNumber(link.downloadCount) },
          })
      : t("{count} of {max} downloads", {
          note: "share link facts",
          variables: {
            count: formatNumber(link.downloadCount),
            max: formatNumber(link.maxDownloads),
          },
        }),
    link.viewCount === 1
      ? t("1 view", { note: "share link facts" })
      : t("{count} views", {
          note: "share link facts",
          variables: { count: formatNumber(link.viewCount) },
        }),
    link.lastAccessedAt === null
      ? null
      : t("Last opened {date}", {
          note: "share link facts",
          variables: { date: date(link.lastAccessedAt) },
        }),
  ].filter((fact): fact is string => fact !== null);

  return (
    <li
      data-slot="share-link-row"
      data-status={link.status}
      className="flex flex-col gap-2 rounded-lg border border-dimah-s3-border p-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <LinkStatusBadge status={link.status} />
            {link.passwordProtected ? (
              <LockIcon
                className="size-3.5 shrink-0 text-dimah-s3-muted-foreground"
                aria-label={t("Needs a password", { note: "share link facts" })}
                role="img"
              />
            ) : null}
            {link.label ? (
              <span className="truncate text-sm font-medium">
                <bdi>{link.label}</bdi>
              </span>
            ) : null}
          </div>
          <p className="text-xs text-dimah-s3-muted-foreground">
            {facts.join(" · ")}
          </p>
          {link.target.available ? null : (
            <p className="text-xs text-dimah-s3-warning">
              {t("The shared item was deleted.", {
                note: "share link facts",
              })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={href === null || revoked}
            aria-label={
              copied
                ? t("Copied", { note: "share link dialog" })
                : t("Copy link", { note: "share link dialog" })
            }
            onClick={onCopy}
          >
            {copied ? (
              <CheckIcon className="text-dimah-s3-success" />
            ) : (
              <CopyIcon />
            )}
          </Button>
          {revoked ? null : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("Change link", { note: "share link dialog" })}
                aria-expanded={mode === "edit"}
                disabled={pending}
                onClick={() => {
                  setDraft(linkDraft(link));
                  setError(null);
                  setMode(mode === "edit" ? "view" : "edit");
                }}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("Turn off link", { note: "share link dialog" })}
                aria-expanded={mode === "revoke"}
                disabled={pending}
                onClick={() => {
                  setError(null);
                  setMode(mode === "revoke" ? "view" : "revoke");
                }}
              >
                <PowerOffIcon />
              </Button>
            </>
          )}
        </div>
      </div>

      {mode === "revoke" ? (
        <div className="flex flex-col gap-2 rounded-md bg-dimah-s3-muted/50 p-2 sm:flex-row sm:items-center">
          <p className="text-xs text-dimah-s3-muted-foreground sm:me-auto">
            {t("Anyone who has this link can no longer open it.", {
              note: "share link dialog",
            })}
          </p>
          <div className="flex gap-2 self-end">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setMode("view")}
            >
              {t("Cancel", { note: "dialog button" })}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={() => void run(() => links.revoke(link.id))}
            >
              {t("Turn off", { note: "share link dialog" })}
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "edit" ? (
        <form
          className="flex flex-col gap-3 border-t border-dimah-s3-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() =>
              links.update(link.id, draftSettings(draft, expiryOptions, link)),
            );
          }}
        >
          <ShareLinkFields
            draft={draft}
            onChange={setDraft}
            expiryOptions={expiryOptions}
            fields={fields}
            link={link}
            disabled={pending}
          />
          <div className="flex gap-2 self-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => setMode("view")}
            >
              {t("Cancel", { note: "dialog button" })}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={pending}
              aria-busy={pending || undefined}
            >
              {t("Save", { note: "share link dialog" })}
            </Button>
          </div>
        </form>
      ) : null}

      {error != null ? (
        <p
          role="alert"
          className="text-xs [overflow-wrap:anywhere] text-dimah-s3-destructive"
        >
          {formatError(error)}
        </p>
      ) : null}
    </li>
  );
}

const STATUS_CLASS: Record<ShareLinkStatus, string> = {
  active: "bg-dimah-s3-success/10 text-dimah-s3-success",
  expired: "bg-dimah-s3-muted text-dimah-s3-muted-foreground",
  exhausted: "bg-dimah-s3-warning/10 text-dimah-s3-warning",
  revoked: "bg-dimah-s3-muted text-dimah-s3-muted-foreground",
};

function LinkStatusBadge({ status }: { status: ShareLinkStatus }) {
  const t = useTranslations();
  const label = {
    active: t("Active", { note: "share link status" }),
    expired: t("Expired", { note: "share link status" }),
    exhausted: t("Limit reached", { note: "share link status" }),
    revoked: t("Turned off", { note: "share link status" }),
  }[status];
  return (
    <Badge variant="secondary" className={STATUS_CLASS[status]}>
      {label}
    </Badge>
  );
}
