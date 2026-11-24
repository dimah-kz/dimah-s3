"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
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
import type { UseShareLinksReturn } from "@dimah-s3/share/react";
import { useTranslations } from "@fuma-translate/react";
import {
  CheckIcon,
  CircleAlertIcon,
  CopyIcon,
  LinkIcon,
  LockIcon,
  PencilIcon,
  PowerOffIcon,
} from "lucide-react";
import { cn } from "cn";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/components/ui/empty";
import { FieldError } from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
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
import { useAnnouncer } from "@/hooks/use-announcer";
import { isolateText } from "@/lib/isolate-text";

/** How long a row shows "Copied", in milliseconds. */
const COPIED_MS = 2000;

/** Props of {@link ShareLinkDialog}. */
export type ShareLinkDialogProps = {
  /**
   * `useShareLinks` from `@dimah-s3/share/react`, for the object or folder
   * to share. The dialog stays closed while its `target` is `null`.
   */
  links: UseShareLinksReturn;
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
  /** Classes on the dialog popup. */
  className?: string;
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
  try {
    return new URL(raw, globalThis.location?.href).href;
  } catch {
    return raw;
  }
}

/**
 * An owner's dialog for the share links of one object or folder: create a
 * link with a lifetime, an optional password, download limit, and note,
 * copy it, and see, change, or turn off the links it already has. It takes
 * `useShareLinks` from `@dimah-s3/share/react`; pass the hook a target only
 * while the dialog is open, so the links load each time it opens.
 *
 * ```tsx
 * const [sharing, setSharing] = useState<ObjectListEntry<DbClientObject>>();
 * const links = useShareLinks(api.share, sharing ? shareTargetOf(sharing) : null);
 *
 * <ShareLinkDialog
 *   links={links}
 *   name={sharing?.name}
 *   open={sharing !== undefined}
 *   onOpenChange={(open) => !open && setSharing(undefined)}
 * />
 * ```
 */
export function ShareLinkDialog({
  links,
  name,
  open,
  onOpenChange,
  expiryOptions = DEFAULT_SHARE_EXPIRY_OPTIONS,
  linkUrl,
  fields,
  className,
}: ShareLinkDialogProps) {
  const showing = open && links.target !== null;
  // Keep what the dialog showed while it animates out.
  const [shown, setShown] = useState({ links, name });
  if (showing && (links !== shown.links || name !== shown.name)) {
    setShown({ links, name });
  }
  const current = showing ? { links, name } : shown;

  // Opened again on a target it already loaded: load again, keeping the
  // rows on screen. A target that just arrived loads on its own.
  const wasOpen = useRef(showing);
  useEffect(() => {
    const opened = showing && !wasOpen.current;
    wasOpen.current = showing;
    if (opened && (links.status === "ready" || links.status === "error")) {
      void links.refresh();
    }
  }, [showing, links]);

  return (
    <Dialog open={showing} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="share-link-dialog"
        // A translated Close in the footer stands for the stock corner button.
        showCloseButton={false}
        className={cn(
          "flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-4 overflow-y-auto bg-dimah-s3-card text-dimah-s3-card-foreground ring-dimah-s3-foreground/10 sm:max-w-lg",
          className,
        )}
      >
        {current.links.target ? (
          <SharePanel
            links={current.links}
            target={current.links.target}
            name={current.name}
            expiryOptions={expiryOptions}
            linkUrl={linkUrl}
            fields={fields}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The last copy of a link, and whether it reached the clipboard. */
type CopyState = { id: string; ok: boolean } | null;

/** A link the owner asked to turn off, and the button that asked. */
type RevokeRequest = { link: ShareClientLink; trigger: HTMLElement | null };

/** The dialog's content. Mounted while the dialog is open. */
function SharePanel({
  links,
  target,
  name,
  expiryOptions,
  linkUrl,
  fields,
}: {
  links: UseShareLinksReturn;
  target: ShareTargetInput;
  name: string | undefined;
  expiryOptions: readonly (number | null)[];
  linkUrl: ShareLinkDialogProps["linkUrl"];
  fields: ShareLinkFieldsOptions | undefined;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatNumber = useFormatNumber();
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<ShareLinkDraft>(newLinkDraft);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<CopyState>(null);
  const [revoking, setRevoking] = useState<RevokeRequest | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  const [notice, announce] = useAnnouncer();

  /** Copies a link's URL; `true` once it is on the clipboard. */
  async function copy(link: ShareClientLink): Promise<boolean> {
    const href = linkHref(link, linkUrl);
    if (href === null) return false;
    let ok = true;
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      ok = false;
    }
    setCopied({ id: link.id, ok });
    clearTimeout(copiedTimer.current);
    if (ok) {
      copiedTimer.current = setTimeout(() => setCopied(null), COPIED_MS);
    }
    return ok;
  }

  async function onCopy(link: ShareClientLink) {
    const ok = await copy(link);
    announce(
      ok
        ? t("Link copied", { note: "share link dialog" })
        : t("Could not copy the link", { note: "share link dialog" }),
    );
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const link = await links.create(draftSettings(draft, expiryOptions));
      setDraft(newLinkDraft());
      const ok = await copy(link);
      announce(
        ok
          ? t("Link created and copied", { note: "share link dialog" })
          : t("Link created", { note: "share link dialog" }),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setCreating(false);
    }
  }

  const count =
    links.status === "ready" && links.links.length > 0 && !links.hasMore
      ? links.links.length
      : null;

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

      <form
        aria-label={t("New link", { note: "share link dialog" })}
        className="flex flex-col gap-3"
        onSubmit={(event) => void onCreate(event)}
      >
        <ShareLinkFields
          draft={draft}
          onChange={setDraft}
          expiryOptions={expiryOptions}
          fields={fields}
          pending={creating}
        />
        {error != null ? (
          <FieldError className="[overflow-wrap:anywhere]">
            {formatError(error)}
          </FieldError>
        ) : null}
        <Button
          type="submit"
          className="self-end pointer-coarse:h-10 data-disabled:opacity-50"
          disabled={creating}
          // Focusable while busy, so focus stays on it.
          focusableWhenDisabled
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
        aria-busy={links.isLoading || links.isRefreshing || undefined}
        className="flex flex-col gap-2 border-t border-dimah-s3-border pt-3"
      >
        <h3
          ref={headingRef}
          id={headingId}
          // Focus lands here once a turned-off link leaves the list.
          tabIndex={-1}
          className="text-sm font-medium text-dimah-s3-foreground outline-none"
        >
          {count === null
            ? t("Links", { note: "share link dialog" })
            : t("Links ({count})", {
                note: "share link dialog",
                variables: { count: formatNumber(count) },
              })}
        </h3>
        <LinkList
          links={links}
          linkUrl={linkUrl}
          expiryOptions={expiryOptions}
          fields={fields}
          copied={copied}
          onCopy={(link) => void onCopy(link)}
          onSaved={() =>
            announce(t("Link changed", { note: "share link dialog" }))
          }
          onRevoke={(link, trigger) => setRevoking({ link, trigger })}
        />
      </section>

      <RevokeDialog
        links={links}
        request={revoking}
        fallbackFocus={headingRef}
        onClose={(done) => {
          setRevoking(null);
          if (done) {
            announce(t("Link turned off", { note: "share link dialog" }));
          }
        }}
      />

      {/* Says what a click did, for screen readers. */}
      <div role="status" className="sr-only">
        {notice}
      </div>

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
  onSaved,
  onRevoke,
}: {
  links: UseShareLinksReturn;
  linkUrl: ShareLinkDialogProps["linkUrl"];
  expiryOptions: readonly (number | null)[];
  fields: ShareLinkFieldsOptions | undefined;
  copied: CopyState;
  onCopy: (link: ShareClientLink) => void;
  onSaved: () => void;
  onRevoke: (link: ShareClientLink, trigger: HTMLElement) => void;
}) {
  const t = useTranslations();
  const formatError = useFormatError();

  if (links.status === "idle" || links.status === "loading") {
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-dimah-s3-muted-foreground"
      >
        <Spinner aria-hidden aria-label={undefined} role={undefined} />
        {t("Loading links", { note: "share link dialog" })}
      </p>
    );
  }

  const failure =
    links.status === "error" && links.error ? (
      <Alert variant="destructive">
        <CircleAlertIcon />
        <AlertDescription className="[overflow-wrap:anywhere]">
          {formatError(links.error)}
        </AlertDescription>
        <AlertAction>
          <Button
            variant="outline"
            size="xs"
            onClick={() => void links.retry()}
          >
            {t("Try again", { note: "share link dialog" })}
          </Button>
        </AlertAction>
      </Alert>
    ) : null;

  if (links.links.length === 0) {
    return (
      failure ?? (
        <Empty className="border border-dimah-s3-border p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LinkIcon />
            </EmptyMedia>
            <EmptyDescription>
              {t("No links yet.", { note: "share link dialog" })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )
    );
  }
  return (
    <>
      <ItemGroup className="gap-2">
        {links.links.map((link) => (
          <LinkRow
            key={link.id}
            link={link}
            links={links}
            href={linkHref(link, linkUrl)}
            expiryOptions={expiryOptions}
            fields={fields}
            copied={copied?.id === link.id ? copied.ok : null}
            onCopy={() => onCopy(link)}
            onSaved={onSaved}
            onRevoke={(trigger) => onRevoke(link, trigger)}
          />
        ))}
      </ItemGroup>
      {failure}
      {links.hasMore && links.status !== "error" ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start data-disabled:opacity-50"
          disabled={links.isLoadingMore}
          focusableWhenDisabled
          aria-busy={links.isLoadingMore || undefined}
          onClick={() => void links.loadMore()}
        >
          {links.isLoadingMore ? (
            <Spinner
              data-icon="inline-start"
              aria-hidden
              aria-label={undefined}
              role={undefined}
            />
          ) : null}
          {t("Show more", { note: "share link dialog" })}
        </Button>
      ) : null}
    </>
  );
}

/** One link: its status, URL, and counts, and Copy, Change, and Turn off. */
function LinkRow({
  link,
  links,
  href,
  expiryOptions,
  fields,
  copied,
  onCopy,
  onSaved,
  onRevoke,
}: {
  link: ShareClientLink;
  links: UseShareLinksReturn;
  href: string | null;
  expiryOptions: readonly (number | null)[];
  fields: ShareLinkFieldsOptions | undefined;
  /** `true` just after a copy, `false` when the copy failed. */
  copied: boolean | null;
  onCopy: () => void;
  onSaved: () => void;
  onRevoke: (trigger: HTMLElement) => void;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const formatDate = useFormatDate();
  const formatNumber = useFormatNumber();
  const formId = useId();
  const editRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ShareLinkDraft>(() => linkDraft(link));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const revoked = link.status === "revoked";

  // Closing the form gives focus back to Change.
  const wasEditing = useRef(editing);
  useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await links.update(link.id, draftSettings(draft, expiryOptions, link));
      setEditing(false);
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const expiry = (value: string) =>
    formatDate(value, { dateStyle: "medium", timeStyle: "short" });
  const facts = [
    link.expiresAt === null
      ? t("Never expires", { note: "share link expiry" })
      : link.status === "expired"
        ? t("Expired {date}", {
            note: "share link facts",
            variables: { date: expiry(link.expiresAt) },
          })
        : t("Expires {date}", {
            note: "share link facts",
            variables: { date: expiry(link.expiresAt) },
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
          variables: {
            date: formatDate(link.lastAccessedAt, { dateStyle: "medium" }),
          },
        }),
  ].filter((fact): fact is string => fact !== null);

  return (
    <Item
      role="listitem"
      variant="outline"
      size="sm"
      data-slot="share-link-row"
      data-status={link.status}
      className="items-start border-dimah-s3-border"
    >
      <ItemContent className="min-w-0">
        <ItemTitle className="min-w-0">
          <LinkStatusBadge status={link.status} />
          {link.passwordProtected ? (
            <LockIcon
              className="size-3.5 shrink-0 text-dimah-s3-muted-foreground"
              aria-label={t("Needs a password", { note: "share link facts" })}
              role="img"
            />
          ) : null}
          {link.label ? (
            <span className="truncate">
              <bdi>{link.label}</bdi>
            </span>
          ) : null}
        </ItemTitle>
        {href !== null && !revoked ? (
          // Selectable, for a browser that does not let the page copy.
          <div
            data-slot="share-link-url"
            className="min-w-0 truncate text-xs text-dimah-s3-muted-foreground"
          >
            <bdi dir="ltr" className="font-mono select-all">
              {href}
            </bdi>
          </div>
        ) : null}
        <ItemDescription>{facts.join(" · ")}</ItemDescription>
        {link.target.available ? null : (
          <ItemDescription className="text-dimah-s3-warning">
            {t("The shared item was deleted.", { note: "share link facts" })}
          </ItemDescription>
        )}
        {copied === false ? (
          <ItemDescription className="text-dimah-s3-warning">
            {t("Could not copy the link. Select it and copy it yourself.", {
              note: "share link dialog",
            })}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions className="gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={href === null || revoked}
          aria-label={
            copied === true
              ? t("Copied", { note: "share link dialog" })
              : t("Copy link", { note: "share link dialog" })
          }
          onClick={onCopy}
        >
          {copied === true ? (
            <CheckIcon className="text-dimah-s3-success" />
          ) : (
            <CopyIcon />
          )}
        </Button>
        {revoked ? null : (
          <>
            <Button
              ref={editRef}
              variant="ghost"
              size="icon-sm"
              aria-label={t("Change link", { note: "share link dialog" })}
              aria-expanded={editing}
              aria-controls={editing ? formId : undefined}
              disabled={pending}
              focusableWhenDisabled
              onClick={() => {
                setDraft(linkDraft(link));
                setError(null);
                setEditing(!editing);
              }}
            >
              <PencilIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("Turn off link", { note: "share link dialog" })}
              aria-haspopup="dialog"
              disabled={pending}
              focusableWhenDisabled
              onClick={(event) => onRevoke(event.currentTarget)}
            >
              <PowerOffIcon />
            </Button>
          </>
        )}
      </ItemActions>

      {editing ? (
        <ItemFooter className="border-t border-dimah-s3-border pt-3">
          <form
            id={formId}
            aria-label={t("Change link", { note: "share link dialog" })}
            className="flex w-full flex-col gap-3"
            onSubmit={(event) => void onSave(event)}
          >
            <ShareLinkFields
              draft={draft}
              onChange={setDraft}
              expiryOptions={expiryOptions}
              fields={fields}
              link={link}
              pending={pending}
            />
            {error != null ? (
              <FieldError className="[overflow-wrap:anywhere]">
                {formatError(error)}
              </FieldError>
            ) : null}
            <div className="flex gap-2 self-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                focusableWhenDisabled
                className="data-disabled:opacity-50"
                onClick={() => setEditing(false)}
              >
                {t("Cancel", { note: "dialog button" })}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                focusableWhenDisabled
                className="data-disabled:opacity-50"
                aria-busy={pending || undefined}
              >
                {pending ? (
                  <Spinner
                    data-icon="inline-start"
                    aria-hidden
                    aria-label={undefined}
                    role={undefined}
                  />
                ) : null}
                {t("Save", { note: "share link dialog" })}
              </Button>
            </div>
          </form>
        </ItemFooter>
      ) : null}
    </Item>
  );
}

/**
 * Asks before a link turns off. Focus starts on Cancel, and goes back to
 * the row's button, or to the list heading once the row left.
 */
function RevokeDialog({
  links,
  request,
  fallbackFocus,
  onClose,
}: {
  links: UseShareLinksReturn;
  request: RevokeRequest | null;
  fallbackFocus: RefObject<HTMLElement | null>;
  /** `done` once the link is off. */
  onClose: (done: boolean) => void;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Keep the copy while the dialog animates out.
  const [shown, setShown] = useState(request);
  if (request && request !== shown) {
    setShown(request);
    setError(null);
  }

  // Where focus goes once the dialog closes.
  const focusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (request) {
      focusRef.current = request.trigger;
      return;
    }
    const trigger = focusRef.current;
    focusRef.current = null;
    if (trigger === null) return;
    (trigger.isConnected ? trigger : fallbackFocus.current)?.focus();
  }, [request, fallbackFocus]);

  async function onConfirm() {
    if (!shown || pending) return;
    setPending(true);
    setError(null);
    try {
      await links.revoke(shown.link.id);
      onClose(true);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose(false);
      }}
    >
      <AlertDialogContent
        size="sm"
        initialFocus={cancelRef}
        finalFocus={false}
        aria-busy={pending || undefined}
      >
        <AlertDialogHeader>
          <AlertDialogMedia>
            <PowerOffIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            {t("Turn off this link?", { note: "share link dialog" })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("Anyone who has this link can no longer open it.", {
              note: "share link dialog",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error != null ? (
          <FieldError className="[overflow-wrap:anywhere]">
            {formatError(error)}
          </FieldError>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={pending}>
            {t("Cancel", { note: "dialog button" })}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            focusableWhenDisabled
            aria-busy={pending || undefined}
            onClick={() => void onConfirm()}
          >
            {pending ? (
              <Spinner
                data-icon="inline-start"
                aria-hidden
                aria-label={undefined}
                role={undefined}
              />
            ) : null}
            {t("Turn off", { note: "share link dialog" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
