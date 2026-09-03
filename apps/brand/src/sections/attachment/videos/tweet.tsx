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
import { TWEET_LANDSCAPE_VIDEO, itemVideoId } from "@/catalog";
import { BlurReveal } from "@/lib/framecn/blur-reveal";
import { SpringPopIn } from "@/lib/framecn/spring-pop-in";
import { StaggeredFadeUp } from "@/lib/framecn/staggered-fade-up";
import { BRAND_FRAME_STYLE } from "@/lib/frame";
import { BrandMark } from "@/lib/mark";

const PREVIEW = "/dimah-avatar.png";
const FPS = 30;
const DURATION_S = 7;
const UPLOAD_START_S = 0.7;
/** Progress hits 100% here; stay uploading so the ring can finish before done. */
const UPLOAD_FULL_S = 5.5;
const UPLOAD_DONE_S = 5.95;

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
        width: TWEET_LANDSCAPE_VIDEO.width,
        height: TWEET_LANDSCAPE_VIDEO.height,
        display: "flex",
        ...BRAND_FRAME_STYLE,
      }}
    >
      <PlaybackBoot />
      <div className="flex size-full flex-col items-center justify-center gap-16">
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <SpringPopIn delayInFrames={6} fps={FPS} durationInFrames={30}>
              <BrandMark className="size-9 [&_svg]:size-5" />
            </SpringPopIn>
            <StaggeredFadeUp
              text="dimah-s3"
              delayInFrames={10}
              fps={FPS}
              fontSize={26}
              fontWeight={600}
              color="#09090b"
              className="tracking-tight"
            />
          </div>
          <BlurReveal
            text="now with shadcn Attachment"
            delayInFrames={16}
            fps={FPS}
            durationInFrames={36}
            fontSize={16}
            fontWeight={400}
            color="#71717a"
            blur={8}
          />
        </div>

        <div className="flex h-64 w-160 items-center justify-center">
          <div className="flex origin-center scale-[1.55] items-stretch justify-center gap-6">
            <SpringPopIn delayInFrames={20} fps={FPS} durationInFrames={44}>
              <FileCard
                time={ownCurrentTime}
                fileName="quarterly-report.pdf"
                fileType="application/pdf"
                fileSize={2_400_000}
              />
            </SpringPopIn>
            <SpringPopIn delayInFrames={26} fps={FPS} durationInFrames={50}>
              <FileCard
                time={ownCurrentTime}
                fileName="avatar.png"
                fileType="image/png"
                fileSize={180_000}
                previewUrl={PREVIEW}
              />
            </SpringPopIn>
            <SpringPopIn delayInFrames={32} fps={FPS} durationInFrames={56}>
              <StatusCard time={ownCurrentTime} />
            </SpringPopIn>
          </div>
        </div>
      </div>
    </Timegroup>
  );
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) ** 2;
}

function uploadAt(time: number) {
  if (time >= UPLOAD_DONE_S) {
    return { state: "done" as const, percent: 100 };
  }
  if (time < UPLOAD_START_S) {
    return { state: "idle" as const, percent: 0 };
  }
  const span = UPLOAD_FULL_S - UPLOAD_START_S;
  const linear = Math.min(1, (time - UPLOAD_START_S) / span);
  return {
    state: "uploading" as const,
    percent: easeOutQuad(linear) * 100,
  };
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
  const { state, percent } = uploadAt(time);

  return (
    <FileAttachment
      size="default"
      orientation="vertical"
      state={state}
      fileName={fileName}
      fileType={fileType}
      fileSize={fileSize}
      previewUrl={previewUrl}
      percent={percent}
      onDismiss={() => undefined}
      className="[&_svg]:transition-none"
    />
  );
}

function StatusCard({ time }: { time: number }) {
  const done = time >= UPLOAD_DONE_S;

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
