"use client";

import { useFormatError, useObjectList } from "@dimah-s3/react";
import {
  downloadSharedFile,
  shareObjectSource,
  type ShareVisitorLink,
} from "@dimah-s3/share/client";
import {
  ObjectList,
  ObjectListContent,
  ObjectListHeader,
  ObjectListSearch,
  ObjectListSortMenu,
} from "@dimah-s3/ui";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { s3Client } from "@/lib/s3-client";

const buttonClass =
  "inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50";

/**
 * Opens a share link: asks for its password when it has one, then lists a
 * shared folder in `ObjectList`, or offers the one shared file.
 */
export function SharedView({ token }: { token: string }) {
  const [access, setAccess] = useState<string>();
  const [link, setLink] = useState<ShareVisitorLink>();
  const [refusal, setRefusal] = useState<unknown>();
  // Words every SHARE_* code, like the rest of the catalog.
  const formatError = useFormatError();

  useEffect(() => {
    let current = true;
    s3Client.share
      .openLink({ token, access })
      .then((opened) => {
        if (current) setLink(opened.link);
      })
      .catch((error: unknown) => {
        if (current) setRefusal(error);
      });
    return () => {
      current = false;
    };
  }, [token, access]);

  if (refusal) {
    return <p className="text-muted-foreground">{formatError(refusal)}</p>;
  }
  if (!link) return null;
  if (link.locked) return <PasswordForm token={token} onUnlock={setAccess} />;

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {link.type === "folder" ? link.folder.name : link.object.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shared with you
          {link.expiresAt &&
            ` until ${new Date(link.expiresAt).toLocaleDateString()}`}
          {link.downloadsLeft !== null &&
            `, ${link.downloadsLeft} download(s) left`}
          .
        </p>
      </div>
      {link.type === "folder" ? (
        <SharedFolder token={token} access={access} />
      ) : (
        <button
          type="button"
          className={`${buttonClass} self-start`}
          onClick={() =>
            void downloadSharedFile(s3Client.share, undefined, {
              token,
              access,
            }).then(({ downloadsLeft }) => setLink({ ...link, downloadsLeft }))
          }
        >
          <Download className="size-4" />
          Download
        </button>
      )}
    </>
  );
}

function PasswordForm({
  token,
  onUnlock,
}: {
  token: string;
  onUnlock: (access: string) => void;
}) {
  const [wrong, setWrong] = useState(false);
  return (
    <form
      className="flex max-w-sm flex-col gap-3"
      action={async (data) => {
        const password = data.get("password");
        if (typeof password !== "string") return;
        try {
          const { access } = await s3Client.share.unlockLink({
            token,
            password,
          });
          onUnlock(access);
        } catch {
          setWrong(true);
        }
      }}
    >
      <label className="text-sm font-medium" htmlFor="share-password">
        This link needs a password
      </label>
      <input
        id="share-password"
        name="password"
        type="password"
        required
        className="h-9 rounded-md border bg-background px-3 text-sm"
        aria-invalid={wrong}
      />
      {wrong && (
        <p role="alert" className="text-sm text-destructive">
          Wrong password
        </p>
      )}
      <button type="submit" className={`${buttonClass} self-start`}>
        Open
      </button>
    </form>
  );
}

function SharedFolder({ token, access }: { token: string; access?: string }) {
  const list = useObjectList({
    ...shareObjectSource(s3Client.share, { token, access }),
    queryKey: ["share", token, access],
    defaultSort: { field: "name", direction: "asc" },
  });
  return (
    <ObjectList
      list={list}
      rootLabel="Shared folder"
      height="32rem"
      renderActions={(entry) =>
        entry.kind === "file" ? (
          <button
            type="button"
            aria-label={`Download ${entry.name}`}
            className="inline-flex size-8 items-center justify-center rounded-md hover:bg-muted"
            onClick={() =>
              void downloadSharedFile(s3Client.share, entry.id, {
                token,
                access,
              })
            }
          >
            <Download className="size-4" />
          </button>
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
