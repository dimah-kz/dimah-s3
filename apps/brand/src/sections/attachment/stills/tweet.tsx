"use client";

import { FileAttachment } from "@dimah-s3/ui";
import { TWEET_LANDSCAPE } from "@/catalog";
import { BrandFrame } from "@/lib/frame";
import { BrandMark } from "@/lib/mark";
import { AttachmentTweetStage } from "@/sections/attachment/tweet-stage";

const PREVIEW = "/dimah-avatar.png";

export function AttachmentTweetStill() {
  return (
    <BrandFrame size={TWEET_LANDSCAPE} className="gap-8">
      <AttachmentTweetStage
        heading={
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3">
              <BrandMark className="size-9 [&_svg]:size-5" />
              <span className="text-[26px] font-semibold tracking-tight text-[#09090b]">
                dimah-s3
              </span>
            </div>
            <p className="text-[16px] text-[#71717a]">
              now with shadcn Attachment
            </p>
          </div>
        }
      >
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
        <FileAttachment
          size="default"
          orientation="vertical"
          state="done"
          fileName="budget.xlsx"
          fileType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          fileSize={84_000}
          onDismiss={() => undefined}
        />
      </AttachmentTweetStage>
    </BrandFrame>
  );
}
