"use client";

import { useEffect, useRef, useState } from "react";
import { useDelete, useDownload, useUpload } from "@dimah-s3/react";
import {
  DeleteButton,
  FileAttachment,
  ProgressDownloadButton,
  UploadDropzone,
} from "@dimah-s3/ui";
import { TryDemoHint } from "@/components/try-demo-hint";
import {
  forgetDemoFile,
  rememberDemoFile,
} from "@/lib/demo/client-object-store";
import { cn } from "@/lib/utils";

const enter =
  "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out";
const reveal =
  "animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out";

type DemoObject = {
  key: string;
  name: string;
  size: number;
  type: string;
  previewUrl: string | null;
};

function keepInsideDemo(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function previewFromFile(file: File) {
  return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
}

function DemoObjectRow({
  object,
  onDeleted,
}: {
  object: DemoObject;
  onDeleted: () => void;
}) {
  const download = useDownload({ route: "avatar", mode: "fetch" });
  const del = useDelete({ route: "avatar", onSuccess: onDeleted });

  return (
    <div
      className={cn("flex w-full flex-col gap-2 p-3 text-start", reveal)}
      onClick={keepInsideDemo}
      onKeyDown={keepInsideDemo}
    >
      <FileAttachment
        state="done"
        fileName={object.name}
        fileSize={object.size}
        fileType={object.type}
        previewUrl={object.previewUrl}
      />
      <div
        className={cn("flex flex-wrap items-center gap-2", reveal, "delay-100")}
      >
        <ProgressDownloadButton
          className="w-fit"
          download={download}
          objectKey={object.key}
          fileName={object.name}
          fileSize={object.size}
          size="sm"
          status={false}
        />
        <DeleteButton
          className="w-fit"
          delete={del}
          objectKey={object.key}
          fileName={object.name}
          fileSize={object.size}
          size="sm"
          status={false}
        />
      </div>
    </div>
  );
}

/** Homepage dropzone: upload an avatar, then download or delete that same object. */
export function HomeDropzoneDemo() {
  const [object, setObject] = useState<DemoObject | null>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const keyRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const replaceObject = (next: DemoObject | null) => {
    const previousKey = keyRef.current;
    keyRef.current = next?.key ?? null;
    if (previousKey && previousKey !== keyRef.current) {
      forgetDemoFile(previousKey);
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (next?.previewUrl) previewUrlRef.current = next.previewUrl;
    setObject(next);
  };

  useEffect(() => {
    return () => {
      if (keyRef.current) forgetDemoFile(keyRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const idle = object == null && !uploading && !failed;

  const upload = useUpload({
    route: "avatar",
    accept: ["image/*"],
    maxFiles: 1,
    maxFileSize: 5 * 1024 * 1024,
    onUploadStart: () => {
      setUploading(true);
      setFailed(false);
      replaceObject(null);
    },
    onFileSuccess: (file, result) => {
      rememberDemoFile(result.key, file);
      setUploading(false);
      setFailed(false);
      replaceObject({
        key: result.key,
        name: file.name,
        size: file.size,
        type: file.type,
        previewUrl: previewFromFile(file),
      });
    },
    onError: () => {
      setUploading(false);
      setFailed(true);
    },
    onCancel: () => {
      setUploading(false);
      setFailed(false);
    },
  });

  return (
    <>
      {idle ? <TryDemoHint className={cn(enter, "delay-700")} /> : null}
      <UploadDropzone
        upload={upload}
        className="w-full"
        status={(node) => {
          if (object && !uploading) {
            return (
              <DemoObjectRow
                object={object}
                onDeleted={() => replaceObject(null)}
              />
            );
          }
          if (uploading || failed) {
            if (node == null) return null;
            return (
              <div className={cn("w-full p-3 text-start", reveal)}>{node}</div>
            );
          }
          return null;
        }}
      >
        {!idle ? (
          <span className="sr-only">
            {object ? "Uploaded file" : "Uploading file"}
          </span>
        ) : undefined}
      </UploadDropzone>
    </>
  );
}
