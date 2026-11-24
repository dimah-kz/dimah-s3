"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  useFormatDate,
  useFormatError,
  useFormatFileSize,
  useFormatNumber,
  useObjectList,
} from "@dimah-s3/react";
import type { ShareVisitorOpenLink } from "@dimah-s3/share/client";
import type { UseShareVisitReturn } from "@dimah-s3/share/react";
import { useTranslations } from "@fuma-translate/react";
import {
  CheckIcon,
  CircleAlertIcon,
  DownloadIcon,
  LinkIcon,
  LockIcon,
} from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeGlyph } from "@/components/dimah-s3/attachment/file-type-glyph";
import { ObjectList } from "@/components/dimah-s3/list/object-list";
import { ObjectListContent } from "@/components/dimah-s3/list/object-list-content";
import { ObjectListHeader } from "@/components/dimah-s3/list/object-list-header";
import { ObjectListSearch } from "@/components/dimah-s3/list/object-list-search";
import { ObjectListSortMenu } from "@/components/dimah-s3/list/object-list-controls";
import { useAnnouncer } from "@/hooks/use-announcer";
import { isolateText } from "@/lib/isolate-text";

/** How long a button shows that its download started, in milliseconds. */
const STARTED_MS = 2000;

/** Props of {@link SharedView}. */
export type SharedViewProps = {
  /** `useShareVisit` from `@dimah-s3/share/react`, for the token in the page URL. */
  visit: UseShareVisitReturn;
  /**
   * Above the file or folder, once the link opens. The default shows the
   * name in an `h1`, the expiry, and the downloads left.
   */
  header?: (link: ShareVisitorOpenLink) => ReactNode;
  /** The top of a shared folder in its breadcrumb. @default the folder's name */
  rootLabel?: string;
  /** Height of a shared folder's list. @default "32rem" */
  height?: string;
  className?: string;
};

/**
 * The page a share link opens: asks for the password when the link has
 * one, then offers the shared file, or lists the shared folder in
 * `ObjectList` with search, sort, and a download per file. A link that
 * does not open says why, from its error code, through `useFormatError`.
 * It takes `useShareVisit` from `@dimah-s3/share/react`.
 *
 * ```tsx
 * // app/s/[token]/shared-page.tsx
 * const visit = useShareVisit(s3Client.share, token);
 * return <SharedView visit={visit} />;
 * ```
 */
export function SharedView({
  visit,
  header,
  rootLabel,
  height = "32rem",
  className,
}: SharedViewProps) {
  const t = useTranslations();
  const formatError = useFormatError();
  const shell = cn("flex w-full flex-col gap-4", className);
  const shellRef = useRef<HTMLDivElement>(null);
  // Set when the password was entered here, so focus moves to what opened.
  const unlockedRef = useRef(false);
  useEffect(() => {
    if (visit.status !== "ready" || !unlockedRef.current) return;
    unlockedRef.current = false;
    shellRef.current?.focus();
  }, [visit.status]);

  switch (visit.status) {
    case "loading":
      return (
        <div data-slot="shared-view" className={shell} aria-busy>
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-dimah-s3-muted-foreground"
          >
            <Spinner aria-hidden aria-label={undefined} role={undefined} />
            {t("Opening the link", { note: "shared view" })}
          </p>
        </div>
      );
    case "error":
      return (
        <div data-slot="shared-view" className={shell}>
          <Empty role="alert" className="border border-dimah-s3-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LinkIcon />
              </EmptyMedia>
              <EmptyTitle className="[overflow-wrap:anywhere]">
                {formatError(visit.error)}
              </EmptyTitle>
            </EmptyHeader>
            {/* A refusal stays; anything else, such as the network, may pass. */}
            {visit.error.code.startsWith("SHARE_") ? null : (
              <EmptyContent>
                <Button variant="outline" onClick={visit.refresh}>
                  {t("Try again", { note: "shared view" })}
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </div>
      );
    case "locked":
      return (
        <div data-slot="shared-view" className={shell}>
          <PasswordForm
            folder={visit.link.type === "folder"}
            onUnlock={async (password) => {
              unlockedRef.current = true;
              try {
                await visit.unlock(password);
              } catch (error) {
                unlockedRef.current = false;
                throw error;
              }
            }}
          />
        </div>
      );
    case "ready":
      return (
        <div
          ref={shellRef}
          data-slot="shared-view"
          // Takes focus once the password opened the link.
          tabIndex={-1}
          className={cn(shell, "outline-none")}
        >
          <SharedContent
            visit={visit}
            link={visit.link}
            header={header}
            rootLabel={rootLabel}
            height={height}
          />
        </div>
      );
  }
}

/** The opened link: its header, then the file or the folder. */
function SharedContent({
  visit,
  link,
  header,
  rootLabel,
  height,
}: {
  visit: UseShareVisitReturn;
  link: ShareVisitorOpenLink;
  header: SharedViewProps["header"];
  rootLabel: string | undefined;
  height: string;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [started, setStarted] = useState<string | null>(null);
  const startedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(startedTimer.current), []);
  const [notice, announce] = useAnnouncer();
  const exhausted = link.downloadsLeft === 0;

  /**
   * Downloads one file; `key` names its button while it waits, and while
   * it shows that the download started.
   */
  async function download(key: string, id: string | undefined) {
    if (downloading !== null) return;
    setDownloading(key);
    setDownloadError(null);
    clearTimeout(startedTimer.current);
    setStarted(null);
    try {
      await visit.download(id);
      setStarted(key);
      startedTimer.current = setTimeout(() => setStarted(null), STARTED_MS);
      announce(t("Download started", { note: "shared view" }));
    } catch (error) {
      setDownloadError(error);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      {header ? header(link) : <SharedViewHeader link={link} />}
      {/* Says that a download started, for screen readers. */}
      <div role="status" className="sr-only">
        {notice}
      </div>
      {downloadError != null ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription className="[overflow-wrap:anywhere]">
            {formatError(downloadError)}
          </AlertDescription>
        </Alert>
      ) : null}
      {link.type === "folder" ? (
        <SharedFolder
          visit={visit}
          rootLabel={rootLabel ?? link.folder.name}
          height={height}
          exhausted={exhausted}
          downloading={downloading}
          started={started}
          onDownload={(id) => void download(id, id)}
        />
      ) : (
        <SharedFile
          link={link}
          exhausted={exhausted}
          pending={downloading !== null}
          started={started === "file"}
          onDownload={() => void download("file", undefined)}
        />
      )}
    </>
  );
}

/** The default header: the name, then the expiry and the downloads left. */
function SharedViewHeader({ link }: { link: ShareVisitorOpenLink }) {
  const t = useTranslations();
  const formatDate = useFormatDate();
  const formatNumber = useFormatNumber();
  const name = link.type === "folder" ? link.folder.name : link.object.name;
  const facts = [
    link.expiresAt === null
      ? null
      : t("Open until {date}", {
          note: "shared view",
          variables: {
            date: formatDate(link.expiresAt, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          },
        }),
    link.downloadsLeft === null
      ? null
      : link.downloadsLeft === 0
        ? t("No downloads left", { note: "shared view" })
        : link.downloadsLeft === 1
          ? t("1 download left", { note: "shared view" })
          : t("{count} downloads left", {
              note: "shared view",
              variables: { count: formatNumber(link.downloadsLeft) },
            }),
  ].filter((fact): fact is string => fact !== null);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere] text-dimah-s3-foreground">
        <bdi>{name}</bdi>
      </h1>
      {/* Read out when a download changes the count. */}
      <p aria-live="polite" className="text-sm text-dimah-s3-muted-foreground">
        {[t("Shared with you", { note: "shared view" }), ...facts].join(" · ")}
      </p>
    </div>
  );
}

function PasswordForm({
  folder,
  onUnlock,
}: {
  /** The link shares a folder. */
  folder: boolean;
  /** Rejects when the password does not open the link. */
  onUnlock: (password: string) => Promise<void>;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || password === "") return;
    setPending(true);
    setError(null);
    try {
      await onUnlock(password);
    } catch (caught) {
      setError(caught);
      setPending(false);
      // Ready for the next try.
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-3"
      onSubmit={(event) => void onSubmit(event)}
    >
      <Field data-invalid={error != null || undefined}>
        <FieldLabel htmlFor={`${id}-password`}>
          <LockIcon aria-hidden className="size-4" />
          {folder
            ? t("This folder needs a password", { note: "shared view" })
            : t("This file needs a password", { note: "shared view" })}
        </FieldLabel>
        <Input
          ref={inputRef}
          id={`${id}-password`}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          readOnly={pending}
          aria-invalid={error != null || undefined}
          aria-describedby={error != null ? `${id}-error` : undefined}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
        {error != null ? (
          <FieldError id={`${id}-error`} className="[overflow-wrap:anywhere]">
            {formatError(error)}
          </FieldError>
        ) : null}
      </Field>
      <Button
        type="submit"
        className="self-start pointer-coarse:h-10 data-disabled:opacity-50"
        disabled={pending}
        focusableWhenDisabled
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
        {t("Open", { note: "shared view" })}
      </Button>
    </form>
  );
}

/** The one file of an object link, with its download button. */
function SharedFile({
  link,
  exhausted,
  pending,
  started,
  onDownload,
}: {
  link: Extract<ShareVisitorOpenLink, { type: "object" }>;
  exhausted: boolean;
  pending: boolean;
  /** The download just started. */
  started: boolean;
  onDownload: () => void;
}) {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  const { object } = link;
  return (
    <Item variant="outline" className="border-dimah-s3-border">
      <ItemMedia className="size-10">
        <FileTypeGlyph
          fileName={object.name}
          contentType={object.contentType}
          layout="icon"
        />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="min-w-0">
          <span className="truncate">
            <bdi>{object.name}</bdi>
          </span>
        </ItemTitle>
        {object.size === null ? null : (
          <ItemDescription>{formatFileSize(object.size)}</ItemDescription>
        )}
      </ItemContent>
      <ItemActions>
        <Button
          disabled={pending || exhausted}
          focusableWhenDisabled
          aria-busy={pending || undefined}
          className="pointer-coarse:h-10 data-disabled:opacity-50"
          onClick={onDownload}
        >
          {pending ? (
            <Spinner
              data-icon="inline-start"
              aria-hidden
              aria-label={undefined}
              role={undefined}
            />
          ) : started ? (
            <CheckIcon data-icon="inline-start" />
          ) : (
            <DownloadIcon data-icon="inline-start" />
          )}
          {t("Download", { note: "shared view" })}
        </Button>
      </ItemActions>
    </Item>
  );
}

/** A shared folder in a read-only `ObjectList`, with a download per file. */
function SharedFolder({
  visit,
  rootLabel,
  height,
  exhausted,
  downloading,
  started,
  onDownload,
}: {
  visit: UseShareVisitReturn;
  rootLabel: string;
  height: string;
  exhausted: boolean;
  /** The file whose download is on its way. */
  downloading: string | null;
  /** The file whose download just started. */
  started: string | null;
  onDownload: (id: string) => void;
}) {
  const t = useTranslations();
  const list = useObjectList({
    ...visit.source,
    queryKey: ["dimah-s3-share", visit.token, visit.access ?? ""],
  });
  return (
    <ObjectList
      list={list}
      rootLabel={rootLabel}
      height={height}
      renderActions={(entry) =>
        entry.kind === "file" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={exhausted || downloading !== null}
            focusableWhenDisabled
            className="data-disabled:opacity-50"
            aria-busy={downloading === entry.id || undefined}
            aria-label={t('Download "{name}"', {
              note: "shared view",
              variables: { name: isolateText(entry.name) },
            })}
            onClick={() => onDownload(entry.id)}
          >
            {downloading === entry.id ? (
              <Spinner aria-hidden aria-label={undefined} role={undefined} />
            ) : started === entry.id ? (
              <CheckIcon className="text-dimah-s3-success" />
            ) : (
              <DownloadIcon />
            )}
          </Button>
        ) : null
      }
    >
      <ObjectListHeader>
        <ObjectListSearch />
        <ObjectListSortMenu />
      </ObjectListHeader>
      <ObjectListContent />
    </ObjectList>
  );
}
