"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { UploadCallOptions, UseUploadReturn } from "@dimah-s3/react";
import { isFieldTarget } from "@/lib/is-field-target";

/** Options for {@link usePasteFiles}. */
export type UsePasteFilesOptions = {
  /** Call options for the pasted files. */
  call?: UploadCallOptions;
  /** @default true */
  enabled?: boolean;
};

/**
 * Uploads files pasted anywhere on the page with `upload.handleFiles`.
 *
 * Pastes into a form field or editable text are left alone, and so are
 * pastes another handler already took, such as a focused `UploadDropzone`
 * (it prevents the default). A paste with no files is ignored.
 */
export function usePasteFiles(
  upload: Pick<UseUploadReturn, "handleFiles">,
  options: UsePasteFilesOptions = {},
): void {
  const enabled = options.enabled ?? true;
  const latest = useRef({
    handleFiles: upload.handleFiles,
    call: options.call,
  });
  useLayoutEffect(() => {
    latest.current = { handleFiles: upload.handleFiles, call: options.call };
  });

  useEffect(() => {
    if (!enabled) return;

    function onPaste(event: ClipboardEvent) {
      if (event.defaultPrevented || isFieldTarget(event.target)) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      const { handleFiles, call } = latest.current;
      void handleFiles(files, call);
    }

    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("paste", onPaste);
    };
  }, [enabled]);
}
