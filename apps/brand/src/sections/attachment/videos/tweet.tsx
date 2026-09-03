"use client";

import { useEffect, useRef } from "react";
import { FileAttachment, StatusAttachment } from "@dimah-s3/ui";
import {
  Timegroup,
  TimelineRoot,
  usePlayback,
  useTimingInfo,
} from "@editframe/react";
import "@editframe/elements/styles.css";
import { TWEET_LANDSCAPE, itemVideoId } from "@/catalog";
import { BlurReveal } from "@/lib/framecn/blur-reveal";
import { SpringPopIn } from "@/lib/framecn/spring-pop-in";
import { StaggeredFadeUp } from "@/lib/framecn/staggered-fade-up";
import { BRAND_FRAME_STYLE } from "@/lib/frame";
import { BrandMark } from "@/lib/mark";

const PREVIEW = "/dimah-avatar.jpg";
const FPS = 30;
const DURATION_S = 6;
const UPLOAD_START_S = 1.5;
const UPLOAD_END_S = 4;

export const ATTACHMENT_TWEET_VIDEO_ID = itemVideoId({
  section: "attachment",
  kind: "videos",
  slug: "tweet",
});

export function AttachmentTweetVideo() {
  return (
    <TimelineRoot
      id={ATTACHMENT_TWEET_VIDEO_ID}
      component={AttachmentTweetTimeline}
    />
  );
}

function AttachmentTweetTimeline({ id }: { id: string }) {
  const { ref, ownCurrentTime } = useTimingInfo();

  return (
    <Timegroup
      ref={ref}
      id={id}
      data-brand-frame=""
      mode="fixed"
      duration={`${String(DURATION_S)}s`}
      fps={FPS}
      loop
      className="overflow-hidden"
      style={{
        width: TWEET_LANDSCAPE.width,
        height: TWEET_LANDSCAPE.height,
        display: "flex",
        ...BRAND_FRAME_STYLE,
      }}
    >
      <PlaybackBoot />
      <div className="flex size-full flex-col items-center justify-center gap-16">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <SpringPopIn delayInFrames={8} fps={FPS} durationInFrames={40}>
              <BrandMark className="size-9 [&_svg]:size-5" />
            </SpringPopIn>
            <StaggeredFadeUp
              text="dimah-s3"
              delayInFrames={14}
              fps={FPS}
              fontSize={26}
              fontWeight={600}
              color="#09090b"
              className="tracking-tight"
            />
          </div>
          <BlurReveal
            text="now with shadcn Attachment"
            delayInFrames={24}
            fps={FPS}
            durationInFrames={54}
            fontSize={16}
            fontWeight={400}
            color="#71717a"
            blur={8}
          />
        </div>

        <div className="flex h-64 w-160 items-center justify-center">
          <div className="flex origin-center scale-[1.55] items-stretch justify-center gap-6">
            <SpringPopIn delayInFrames={38} fps={FPS} durationInFrames={48}>
              <FileCard
                time={ownCurrentTime}
                fileName="quarterly-report.pdf"
                fileType="application/pdf"
                fileSize={2_400_000}
              />
            </SpringPopIn>
            <SpringPopIn delayInFrames={46} fps={FPS} durationInFrames={48}>
              <FileCard
                time={ownCurrentTime}
                fileName="avatar.png"
                fileType="image/png"
                fileSize={180_000}
                previewUrl={PREVIEW}
              />
            </SpringPopIn>
            <SpringPopIn delayInFrames={54} fps={FPS} durationInFrames={48}>
              <StatusCard time={ownCurrentTime} />
            </SpringPopIn>
          </div>
        </div>
      </div>
    </Timegroup>
  );
}

function FileCard({
  time,
  fileName,
  fileType,
  fileSize,
  previewUrl,
}: {
  time: number;
  fileName: string;
  fileType: string;
  fileSize: number;
  previewUrl?: string;
}) {
  const uploading = time >= UPLOAD_START_S && time < UPLOAD_END_S;
  const done = time >= UPLOAD_END_S;
  const span = UPLOAD_END_S - UPLOAD_START_S;
  const percent = done
    ? 100
    : uploading
      ? Math.min(100, ((time - UPLOAD_START_S) / span) * 100)
      : 0;

  return (
    <FileAttachment
      size="default"
      orientation="vertical"
      state={done ? "done" : uploading ? "uploading" : "idle"}
      fileName={fileName}
      fileType={fileType}
      fileSize={fileSize}
      previewUrl={previewUrl}
      percent={percent}
      onDismiss={() => undefined}
    />
  );
}

function StatusCard({ time }: { time: number }) {
  const done = time >= UPLOAD_END_S;

  return (
    <StatusAttachment
      size="default"
      orientation="vertical"
      state={done ? "done" : "processing"}
      title={done ? "Ready" : "Uploading"}
    />
  );
}

function PlaybackBoot() {
  const host = useRef<HTMLDivElement>(null);
  const autoPlayed = useRef(false);
  const playback = usePlayback(host);

  useEffect(() => {
    if (autoPlayed.current) return;
    if (playback.playing) {
      autoPlayed.current = true;
      return;
    }
    playback.play();
  }, [playback]);

  return (
    <div
      ref={host}
      className="pointer-events-none absolute size-0 overflow-hidden"
      aria-hidden
    />
  );
}
