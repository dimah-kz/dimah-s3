"use client";

import {
  useEffect,
  useId,
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
import {
  downloadSharedFile,
  shareObjectSource,
  type ShareAccess,
  type ShareClientActions,
  type ShareVisitorLink,
} from "@dimah-s3/share/client";
import { useTranslations } from "@fuma-translate/react";
import { DownloadIcon, LinkIcon, LockIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { FileTypeGlyph } from "@/components/dimah-s3/attachment/file-type-glyph";
import { ObjectList } from "@/components/dimah-s3/list/object-list";
import { ObjectListContent } from "@/components/dimah-s3/list/object-list-content";
import { ObjectListHeader } from "@/components/dimah-s3/list/object-list-header";
import { ObjectListSearch } from "@/components/dimah-s3/list/object-list-search";
import { ObjectListSortMenu } from "@/components/dimah-s3/list/object-list-controls";

/** The visitor actions {@link SharedView} calls: `api.share` from `shareClient()`. */
export type SharedViewActions = Pick<
  ShareClientActions,
  "openLink" | "unlockLink" | "listShared" | "downloadShared"
>;

/** A link that opened: its file or folder is known. */
export type SharedViewLink = Extract<ShareVisitorLink, { locked: false }>;

/** Props of {@link SharedView}. */
export type SharedViewProps = {
  /** `api.share` from a client with `shareClient()`. */
  share: SharedViewActions;
  /** The token from the page URL. */
  token: string;
  /**
   * The link as `openLink` returned it on the server, so the page renders
   * at once. Without it, the view opens the link itself.
   */
  link?: ShareVisitorLink;
  /**
   * Above the file or folder, once the link opens. The default shows the
   * name, the expiry, and the downloads left.
   */
  header?: (link: SharedViewLink) => ReactNode;
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
 *
 * ```tsx
 * // app/s/[token]/page.tsx
 * <SharedView share={s3Client.share} token={token} />
 * ```
 */
export function SharedView({
  share,
  token,
  link: initialLink,
  header,
  rootLabel,
  height = "32rem",
  className,
}: SharedViewProps) {
  const t = useTranslations();
  const formatError = useFormatError();
  const [access, setAccess] = useState<ShareAccess>();
  const [opened, setOpened] = useState<{
    token: string;
    access: ShareAccess | undefined;
    link?: ShareVisitorLink;
    error?: unknown;
  } | null>(
    initialLink ? { token, access: undefined, link: initialLink } : null,
  );
  const [downloadError, setDownloadError] = useState<unknown>(null);

  // Open the link, again once a password unlocks it.
  const current =
    opened !== null && opened.token === token && opened.access === access
      ? opened
      : null;
  useEffect(() => {
    if (current !== null) return;
    let live = true;
    share.openLink({ token, ...(access !== undefined && { access }) }).then(
      ({ link }) => {
        if (live) setOpened({ token, access, link });
      },
      (error: unknown) => {
        if (live) setOpened({ token, access, error });
      },
    );
    return () => {
      live = false;
    };
  }, [current, share, token, access]);

  const shell = cn("flex w-full flex-col gap-4", className);
  if (current === null) {
    return (
      <div data-slot="shared-view" className={shell} aria-busy>
        <p className="flex items-center gap-2 text-sm text-dimah-s3-muted-foreground">
          <Spinner aria-hidden aria-label={undefined} role={undefined} />
          {t("Opening the link", { note: "shared view" })}
        </p>
      </div>
    );
  }
  if (current.link === undefined) {
    return (
      <div data-slot="shared-view" className={shell}>
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dimah-s3-border p-8 text-center">
          <LinkIcon
            aria-hidden
            className="size-6 text-dimah-s3-muted-foreground"
          />
          <p role="alert" className="text-sm text-dimah-s3-foreground">
            {formatError(current.error)}
          </p>
        </div>
      </div>
    );
  }
  const { link } = current;
  if (link.locked) {
    return (
      <div data-slot="shared-view" className={shell}>
        <PasswordForm share={share} token={token} onUnlock={setAccess} />
      </div>
    );
  }

  const download = async (id: string | undefined) => {
    setDownloadError(null);
    try {
      const { downloadsLeft } = await downloadSharedFile(share, id, {
        token,
        ...(access !== undefined && { access }),
      });
      setOpened({ ...current, link: { ...link, downloadsLeft } });
    } catch (error) {
      setDownloadError(error);
    }
  };

  return (
    <div data-slot="shared-view" className={shell}>
      {header ? header(link) : <SharedViewHeader link={link} />}
      {downloadError != null ? (
        <p
          role="alert"
          className="text-sm [overflow-wrap:anywhere] text-dimah-s3-destructive"
        >
          {formatError(downloadError)}
        </p>
      ) : null}
      {link.type === "folder" ? (
        <SharedFolder
          share={share}
          token={token}
          access={access}
          rootLabel={rootLabel ?? link.folder.name}
          height={height}
          onDownload={(id) => void download(id)}
        />
      ) : (
        <SharedFile link={link} onDownload={() => download(undefined)} />
      )}
    </div>
  );
}

/** The default header: the name, then the expiry and the downloads left. */
function SharedViewHeader({ link }: { link: SharedViewLink }) {
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
            date: formatDate(link.expiresAt, { dateStyle: "medium" }),
          },
        }),
    link.downloadsLeft === null
      ? null
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
      <p className="text-sm text-dimah-s3-muted-foreground">
        {[t("Shared with you", { note: "shared view" }), ...facts].join(" · ")}
      </p>
    </div>
  );
}

function PasswordForm({
  share,
  token,
  onUnlock,
}: {
  share: SharedViewActions;
  token: string;
  onUnlock: (access: ShareAccess) => void;
}) {
  const t = useTranslations();
  const formatError = useFormatError();
  const id = useId();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || password === "") return;
    setPending(true);
    setError(null);
    try {
      const { access } = await share.unlockLink({ token, password });
      onUnlock(access);
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-3"
      onSubmit={(event) => void onSubmit(event)}
    >
      <Label htmlFor={`${id}-password`} className="text-dimah-s3-foreground">
        <LockIcon aria-hidden className="size-4" />
        {t("This link needs a password", { note: "shared view" })}
      </Label>
      <Input
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
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-dimah-s3-destructive"
        >
          {formatError(error)}
        </p>
      ) : null}
      <Button
        type="submit"
        className="self-start pointer-coarse:h-10"
        disabled={pending}
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
  onDownload,
}: {
  link: Extract<SharedViewLink, { type: "object" }>;
  onDownload: () => Promise<void>;
}) {
  const t = useTranslations();
  const formatFileSize = useFormatFileSize();
  const [pending, setPending] = useState(false);
  const { object } = link;
  const exhausted = link.downloadsLeft === 0;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dimah-s3-border p-3">
      <span className="flex size-10 shrink-0 items-center justify-center">
        <FileTypeGlyph
          fileName={object.name}
          contentType={object.contentType}
          layout="icon"
        />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-dimah-s3-foreground">
          <bdi>{object.name}</bdi>
        </span>
        {object.size === null ? null : (
          <span className="text-xs text-dimah-s3-muted-foreground">
            {formatFileSize(object.size)}
          </span>
        )}
      </div>
      <Button
        disabled={pending || exhausted}
        aria-busy={pending || undefined}
        className="pointer-coarse:h-10"
        onClick={() => {
          setPending(true);
          void onDownload().finally(() => setPending(false));
        }}
      >
        {pending ? (
          <Spinner
            data-icon="inline-start"
            aria-hidden
            aria-label={undefined}
            role={undefined}
          />
        ) : (
          <DownloadIcon data-icon="inline-start" />
        )}
        {t("Download", { note: "shared view" })}
      </Button>
    </div>
  );
}

/** A shared folder in a read-only `ObjectList`, with a download per file. */
function SharedFolder({
  share,
  token,
  access,
  rootLabel,
  height,
  onDownload,
}: {
  share: SharedViewActions;
  token: string;
  access: ShareAccess | undefined;
  rootLabel: string;
  height: string;
  onDownload: (id: string) => void;
}) {
  const t = useTranslations();
  const list = useObjectList({
    ...shareObjectSource(share, {
      token,
      ...(access !== undefined && { access }),
    }),
    queryKey: ["dimah-s3-share", token, access ?? ""],
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
            aria-label={t('Download "{name}"', {
              note: "shared view",
              variables: { name: entry.name },
            })}
            onClick={() => onDownload(entry.id)}
          >
            <DownloadIcon />
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
