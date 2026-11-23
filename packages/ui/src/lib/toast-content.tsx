import type { ReactNode } from "react";
import { FileName } from "@/components/dimah-s3/attachment/file-name";

/** Lets long file names and messages wrap inside a toast. */
export function ToastText({ children }: { children: ReactNode }) {
  return <span className="block [overflow-wrap:anywhere]">{children}</span>;
}

/** Sizes and counts, isolated so localized digits and units keep their order. */
export function ToastNumbers({ children }: { children: string }) {
  return (
    <bdi className="inline-block whitespace-nowrap tabular-nums">
      {children}
    </bdi>
  );
}

/**
 * One file in a toast: its name, then `detail` (such as its size), then
 * `error` on a line of its own.
 */
export function ToastFile({
  name,
  detail,
  error,
}: {
  name: string;
  detail?: string | null;
  error?: string | null;
}) {
  return (
    <>
      <span className="block">
        <FileName name={name} />
        {detail ? (
          <>
            {" "}
            · <ToastNumbers>{detail}</ToastNumbers>
          </>
        ) : null}
      </span>
      {error ? <ToastText>{error}</ToastText> : null}
    </>
  );
}
