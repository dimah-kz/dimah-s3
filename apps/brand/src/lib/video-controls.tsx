"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { Controls, Scrubber, TimeDisplay, TogglePlay } from "@editframe/react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HostProps = {
  target?: string;
  className?: string;
  children?: ReactNode;
};

const VideoControls = Controls as unknown as ComponentType<HostProps>;
const VideoTogglePlay = TogglePlay as unknown as ComponentType<HostProps>;
const VideoTimeDisplay = TimeDisplay as unknown as ComponentType<HostProps>;

export function BrandVideoControls({ target }: { target: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-12 items-center gap-3 border-t border-zinc-200 px-4 py-3" />
    );
  }

  return (
    <VideoControls
      target={target}
      className="brand-video-controls flex items-center gap-3 border-t border-zinc-200 px-4 py-3"
    >
      <VideoTogglePlay>
        <button
          type="button"
          slot="play"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          <PlayIcon data-icon="inline-start" />
          Play
        </button>
        <button
          type="button"
          slot="pause"
          className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
        >
          <PauseIcon data-icon="inline-start" />
          Pause
        </button>
      </VideoTogglePlay>
      <Scrubber className="min-w-0 flex-1" />
      <VideoTimeDisplay className="shrink-0 font-mono text-xs text-zinc-500" />
    </VideoControls>
  );
}
