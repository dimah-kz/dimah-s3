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
import {
  forgetDemoFile,
  getDemoFileUrl,
  rememberDemoFile,
} from "@/lib/demo/client-object-store";

type DemoObject = {
  key: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string | null;
};

/** Homepage dropzone: upload a file, then download or delete that same object. */
export function HomeDropzoneDemo() {
  const [object, setObject] = useState<DemoObject | null>(null);
  const keyRef = useRef<string | null>(null);

  const replaceObject = (next: DemoObject | null) => {
    const previousKey = keyRef.current;
    keyRef.current = next?.key ?? null;
    if (previousKey && previousKey !== keyRef.current) {
      forgetDemoFile(previousKey);
    }
    startTransition(() => setObject(next));
  };

  useEffect(() => {
    return () => {
      if (keyRef.current) forgetDemoFile(keyRef.current);
    };
  }, []);

  const upload = useUpload({
    route: "avatar",
    maxFileSize: 75 * 1024 * 1024,
    onUploadStart: () => replaceObject(null),
    onSuccess: (result, file) => {
      // Demo only: keep the bytes in the browser for the preview and download.
      rememberDemoFile(result.key, file);
      const type = result.type ?? file.type;
      replaceObject({
        key: result.key,
        name: result.name ?? file.name,
        size: result.size,
        type,
        previewUrl: type.startsWith("image/")
          ? getDemoFileUrl(result.key)
          : null,
      });
    },
  });
  const download = useFetchDownload({ route: "avatar" });
  const remove = useDelete({ route: "avatar" });

  const clear = () => {
    replaceObject(null);
    upload.reset();
  };

  const uploaded = object != null && !upload.isPending;

  return (
    <div className="flex w-full flex-col gap-3">
      <Upload upload={upload}>
        {/* Progress shows inside the dropzone until the file card replaces it. */}
        <UploadDropzone className="w-full">
          <UploadDropzoneTrigger />
          {uploaded ? null : <UploadStatus />}
        </UploadDropzone>
        {uploaded ? (
          <ViewTransition>
            <div className="flex w-full flex-col gap-2">
              <FileAttachment
                state="done"
                fileName={object.name}
                fileSize={object.size}
                contentType={object.type}
                previewUrl={object.previewUrl}
                onDismiss={clear}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Download download={download}>
                  <DownloadTrigger
                    size="sm"
                    objectKey={object.key}
                    fileName={object.name}
                    fileSize={object.size}
                  />
                </Download>
                <Delete
                  delete={remove}
                  onDeleted={(result) => {
                    if (result.deleted.includes(object.key)) clear();
                  }}
                >
                  <DeleteTrigger
                    size="sm"
                    objectKey={object.key}
                    fileName={object.name}
                    fileSize={object.size}
                  />
                </Delete>
              </div>
            </div>
          </ViewTransition>
        ) : null}
      </Upload>
      <UploadToasts upload={upload} />
      <DownloadToasts download={download} />
      <DeleteToasts delete={remove} />
    </div>
  );
}
