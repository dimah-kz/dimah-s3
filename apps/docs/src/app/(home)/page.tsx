import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { DemoS3Provider } from "@/components/demo-s3-provider";
import { UploadDropzoneDemo } from "@/components/demos/upload-dropzone-demo";
import { TryDemoHint } from "@/components/try-demo-hint";
import { buttonVariants } from "@/components/ui/button";
import { githubRepoUrl } from "@/lib/shared";
import { cn } from "@/lib/utils";

const githubUrl = githubRepoUrl();

const enter =
  "animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out";

export default function HomePage() {
  return (
    <section className="relative mx-auto flex w-full min-w-0 flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-92 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--color-fd-primary)_12%,transparent),transparent_70%)]"
      />

      <div className="flex w-full max-w-3xl flex-col items-center gap-5 sm:gap-6">
        <p
          className={cn(
            enter,
            "rounded-full border border-fd-border px-3 py-1 text-sm font-medium tracking-wide text-fd-muted-foreground",
          )}
        >
          Presign-first S3 for React
        </p>
        <h1
          className={cn(
            enter,
            "delay-100 max-w-3xl text-balance text-3xl font-bold tracking-tight text-fd-foreground sm:text-4xl lg:text-5xl",
          )}
        >
          Full-stack S3 lifecycle with server and React hooks
        </h1>
        <p
          className={cn(
            enter,
            "delay-150 max-w-xl text-pretty text-base leading-relaxed text-fd-muted-foreground sm:text-lg sm:leading-8",
          )}
        >
          Minimal setup, powered by the AWS SDK (v3).
        </p>
        <div
          className={cn(
            enter,
            "delay-200 flex flex-wrap items-center justify-center gap-3",
          )}
        >
          <Link
            href="/docs/quickstart"
            className={buttonVariants({ size: "lg" })}
          >
            Get Started
            <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
          </Link>
          <Link
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
            })}
          >
            <SiGithub
              title=""
              color="currentColor"
              aria-hidden
              data-icon="inline-start"
            />
            View on GitHub
          </Link>
        </div>
      </div>

      <div className={cn(enter, "relative mt-20 w-full max-w-md delay-300")}>
        <TryDemoHint className={cn(enter, "delay-700")} />
        <DemoS3Provider>
          <UploadDropzoneDemo />
        </DemoS3Provider>
      </div>
    </section>
  );
}
