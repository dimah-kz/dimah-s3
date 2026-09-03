"use client";

import { FileAttachment, StatusAttachment } from "@dimah-s3/ui";
import { TWEET_LANDSCAPE } from "@/catalog";
import { BrandFrame } from "@/lib/frame";
import { BrandMark } from "@/lib/mark";

const PREVIEW = "/dimah-avatar.jpg";

export function AttachmentTweetStill() {
  return (
    <BrandFrame size={TWEET_LANDSCAPE} className="gap-16">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <BrandMark className="size-9 [&_svg]:size-5" />
          <span className="text-[26px] font-semibold tracking-tight text-[#09090b]">
            dimah-s3
          </span>
        </div>
        <p className="text-[16px] text-[#71717a]">now with shadcn Attachment</p>
      </div>

      <div className="flex h-64 w-160 items-center justify-center">
        <div className="flex origin-center scale-[1.55] items-stretch justify-center gap-6">
          <FileAttachment
            size="default"
            orientation="vertical"
            state="done"
            fileName="quarterly-report.pdf"
            fileType="application/pdf"
            fileSize={2_400_000}
            onDismiss={() => undefined}
          />
          <FileAttachment
            size="default"
            orientation="vertical"
            state="done"
            fileName="avatar.png"
            fileType="image/png"
            fileSize={180_000}
            previewUrl={PREVIEW}
            onDismiss={() => undefined}
          />
          <StatusAttachment
            size="default"
            orientation="vertical"
            state="done"
            title="Ready"
          />
        </div>
      </div>
    </BrandFrame>
  );
}
