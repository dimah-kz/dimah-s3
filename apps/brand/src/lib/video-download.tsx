"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import type { EFTimegroupElement } from "@editframe/elements";
import { createRenderClone, renderTimegroupToVideo } from "@editframe/elements";
import { cn } from "cn";
import { evenAvcSize } from "@/catalog";
import { patchFileGlyphsForExport } from "@/lib/rasterize-file-glyphs";
import { buttonVariants } from "@/components/ui/button";

export function BrandVideoDownload({
  target,
  fps,
  width,
  height,
  filename,
}: {
  target: string;
  fps: number;
  width: number;
  height: number;
  filename: string;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress != null;

  async function download() {
    const tg = document.getElementById(target) as EFTimegroupElement | null;
    if (!tg?.renderToVideo) {
      setError("Video is not ready yet.");
      return;
    }

    const hadLoop = tg.hasAttribute("loop");
    tg.removeAttribute("loop");
    setError(null);
    setProgress(0);

    try {
      const size = evenAvcSize({ width, height });
      const handle = await createRenderClone(tg, {
        width: size.width,
        height: size.height,
        isolateMedia: true,
      });
      handle.clone.removeAttribute("loop");
      const unpatch = patchFileGlyphsForExport(handle.clone);
      try {
        const result = await renderTimegroupToVideo(handle.clone, {
          fps,
          width: size.width,
          height: size.height,
          includeAudio: false,
          progressPreviewInterval: 0,
          onProgress: ({ frame, totalFrames }) => {
            setProgress(totalFrames > 0 ? frame / totalFrames : 0);
          },
        });
        if (!result.buffer) {
          throw new Error("Render produced no file.");
        }
        const blob = new Blob([result.buffer], {
          type: result.mimeType || "video/mp4",
        });
        const url = URL.createObjectURL(blob);
        const link = Object.assign(document.createElement("a"), {
          href: url,
          download: filename,
        });
        link.click();
        URL.revokeObjectURL(url);
      } finally {
        unpatch();
        handle.dispose();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Render failed.");
    } finally {
      if (hadLoop) tg.setAttribute("loop", "");
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void download()}
        className={cn(buttonVariants({ size: "sm" }))}
      >
        <DownloadIcon data-icon="inline-start" />
        {busy
          ? `Rendering ${String(Math.round((progress ?? 0) * 100))}%`
          : "Download MP4"}
      </button>
      {error ? (
        <p className="max-w-64 text-end text-xs text-red-600">{error}</p>
      ) : null}
    </div>
  );
}
