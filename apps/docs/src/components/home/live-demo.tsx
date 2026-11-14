"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  ViewTransition,
} from "react";
import { useDelete, useFetchDownload, useUpload } from "@dimah-s3/react";
import {
  Delete,
  DeleteToasts,
  DeleteTrigger,
  Download,
  DownloadToasts,
  DownloadTrigger,
  FileAttachment,
  Upload,
  UploadDropzone,
  UploadDropzoneTrigger,
  UploadStatus,
  UploadToasts,
} from "@dimah-s3/ui";
import { DemoS3Provider } from "@/components/demo-s3-provider";
import {
  forgetDemoFile,
  getDemoFileUrl,
  rememberDemoFile,
} from "@/lib/demo/client-object-store";

const ROUTE = "uploads";
/** Newest first; older files leave the list. */
const MAX_SHOWN = 4;

type DemoObject = {
  key: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string | null;
};

/** Homepage demo: upload files, then download or delete each one from its card. */
export function LiveDemo() {
  return (
    <section
      aria-labelledby="live-demo-title"
      className="overflow-hidden rounded-2xl border border-fd-border bg-fd-card shadow-xl shadow-black/5 dark:shadow-black/40"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <h2 id="live-demo-title" className="text-sm font-medium">
          Live demo
        </h2>
        <span className="inline-flex items-center gap-1.5 text-xs text-fd-muted-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
          In your browser
        </span>
      </div>
      <div className="p-4 pt-3">
        <DemoS3Provider>
          <DemoFiles />
        </DemoS3Provider>
      </div>
    </section>
  );
}

function DemoFiles() {
  const [objects, setObjects] = useState<DemoObject[]>([]);
  // Every key this demo remembered, so unmount frees the object URLs.
  const keysRef = useRef(new Set<string>());

  useEffect(() => {
    const keys = keysRef.current;
    return () => {
      for (const key of keys) forgetDemoFile(key);
    };
  }, []);

  const upload = useUpload({
    route: ROUTE,
    maxFiles: 3,
    maxFileSize: 75 * 1024 * 1024,
    queue: true,
    onSuccess: (result, file) => {
      // Demo only: keep the bytes in the browser for the preview and download.
      rememberDemoFile(result.key, file);
      keysRef.current.add(result.key);
      const type = result.type ?? file.type;
      const object: DemoObject = {
        key: result.key,
        name: result.name ?? file.name,
        size: result.size,
        type,
        previewUrl: type.startsWith("image/")
          ? getDemoFileUrl(result.key)
          : null,
      };
      startTransition(() =>
        setObjects((current) => [object, ...current].slice(0, MAX_SHOWN)),
      );
    },
  });
  const download = useFetchDownload({ route: ROUTE });
  const remove = useDelete({ route: ROUTE });

  /** What the card says while its file transfers. `undefined` shows the size. */
  const activity = (key: string) => {
    if (remove.pendingKeys.includes(key)) return "Deleting…";
    if (!download.pendingKeys.includes(key)) return undefined;
    const operation = download.get(key);
    return operation?.phase === "downloading" ? (
      <span className="tabular-nums">
        Downloading · {Math.round(operation.progress.percent)}%
      </span>
    ) : (
      "Preparing download…"
    );
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Uploaded files leave the status and move to the list below. */}
      <Upload upload={upload} hideUploaded>
        <UploadDropzone className="w-full">
          <UploadDropzoneTrigger />
          <UploadStatus />
        </UploadDropzone>
      </Upload>

      <Download download={download}>
        <Delete
          delete={remove}
          onDeleted={(result) => {
            for (const key of result.deleted) keysRef.current.delete(key);
            startTransition(() =>
              setObjects((current) =>
                current.filter(
                  (object) => !result.deleted.includes(object.key),
                ),
              ),
            );
          }}
        >
          {objects.length > 0 ? (
            <ul aria-label="Uploaded files" className="flex flex-col gap-2">
              {objects.map((object) => (
                <ViewTransition key={object.key}>
                  <li>
                    <FileAttachment
                      state="done"
                      fileName={object.name}
                      fileSize={object.size}
                      contentType={object.type}
                      previewUrl={object.previewUrl}
                      description={activity(object.key)}
                      actions={
                        <>
                          <DownloadTrigger
                            objectKey={object.key}
                            fileName={object.name}
                            fileSize={object.size}
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Download ${object.name}`}
                            tooltip="Download"
                          />
                          <DeleteTrigger
                            objectKey={object.key}
                            fileName={object.name}
                            fileSize={object.size}
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Delete ${object.name}`}
                            tooltip="Delete"
                          />
                        </>
                      }
                    />
                  </li>
                </ViewTransition>
              ))}
            </ul>
          ) : null}
        </Delete>
      </Download>

      <UploadToasts upload={upload} />
      <DownloadToasts download={download} />
      <DeleteToasts delete={remove} />
    </div>
  );
}
