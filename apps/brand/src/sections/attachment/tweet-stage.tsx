import type { ReactNode } from "react";
import { BrandWindow } from "@/lib/frame";

/**
 * Unscaled card-row box. Visual size is this × `CARD_SCALE`.
 * 3× `w-30` vertical attachments + 2× `gap-6`.
 */
const CARD_ROW = { width: 408, height: 168 } as const;
const CARD_SCALE = 1.5;

export function AttachmentTweetStage({
  heading,
  children,
}: {
  heading: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {heading}
      <BrandWindow>
        <div
          className="flex items-center justify-center"
          style={{
            width: CARD_ROW.width * CARD_SCALE,
            height: CARD_ROW.height * CARD_SCALE,
          }}
        >
          <div
            className="flex items-stretch justify-center gap-6"
            style={{ transform: `scale(${String(CARD_SCALE)})` }}
          >
            {children}
          </div>
        </div>
      </BrandWindow>
    </>
  );
}
