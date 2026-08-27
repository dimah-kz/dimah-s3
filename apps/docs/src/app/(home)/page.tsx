import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { DemoS3Provider } from "@/components/demo-s3-provider";
import { HomeDropzoneDemo } from "@/components/demos/home-dropzone-demo";
import { HomeAnnouncement } from "@/components/home-announcement";
import { HomeBackground } from "@/components/home-background";
import { buttonVariants } from "@/components/ui/button";
import { githubRepoUrl, siteTagline } from "@/lib/shared";
import { cn } from "@/lib/utils";

const githubUrl = githubRepoUrl();

const enter =
  "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700 ease-out motion-reduce:animate-none";

const highlights = ["Presigned flows", "S3-compatible", "Optional UI"];

export default function HomePage() {
  return (
    <section
      aria-labelledby="home-title"
      className="relative isolate mx-auto flex min-h-[calc(100svh-4rem)] w-full min-w-0 flex-1 items-center overflow-hidden px-4 py-14 sm:px-6 sm:py-16 lg:px-8"
    >
      <HomeBackground />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] lg:gap-12 xl:gap-20">
        <div className="flex min-w-0 flex-col items-center text-center lg:items-start lg:text-start">
          <HomeAnnouncement className={cn(enter, "delay-75")} />

          <h1
            id="home-title"
            className={cn(
              enter,
              "mt-7 max-w-4xl bg-linear-to-b from-fd-foreground from-45% to-fd-foreground/60 bg-clip-text text-balance text-4xl leading-[1.04] font-semibold tracking-[-0.045em] text-transparent delay-100 sm:text-5xl lg:max-w-2xl lg:text-[58px]",
            )}
          >
            {siteTagline}
          </h1>

          <p
            className={cn(
              enter,
              "mt-6 max-w-xl text-pretty text-base leading-7 text-fd-muted-foreground delay-150 sm:text-lg sm:leading-8",
            )}
          >
            Minimal setup, powered by the AWS SDK (v3).
          </p>

          <div
            className={cn(
              enter,
              "mt-8 flex flex-wrap items-center justify-center gap-3 delay-200 lg:justify-start",
            )}
          >
            <Link
              href="/docs/quickstart"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-full px-5 shadow-lg shadow-primary/10",
              )}
            >
              Get Started
              <ArrowRight data-icon="inline-end" className="rtl:rotate-180" />
            </Link>
            <Link
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className={cn(
                buttonVariants({
                  variant: "outline",
                  size: "lg",
                }),
                "h-11 rounded-full bg-fd-background/70 px-5 backdrop-blur-sm",
              )}
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

          <ul
            className={cn(
              enter,
              "mt-9 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-medium tracking-wide text-fd-muted-foreground delay-300 lg:justify-start",
            )}
          >
            {highlights.map((highlight, index) => (
              <li key={highlight} className="flex items-center gap-x-4">
                {index > 0 ? (
                  <span
                    aria-hidden
                    className="size-1 rounded-full bg-fd-muted-foreground/45"
                  />
                ) : null}
                {highlight}
              </li>
            ))}
          </ul>
        </div>

        <div
          className={cn(
            enter,
            "relative mx-auto w-full max-w-xl delay-300 lg:delay-200",
          )}
        >
          <div className="relative rounded-[1.75rem] border border-fd-border/80 bg-fd-card/75 p-3 shadow-2xl shadow-fd-foreground/5 backdrop-blur-xl sm:p-4">
            <div className="flex h-8 items-center justify-end px-2">
              <span className="inline-flex -mt-2 items-center gap-1.5 rounded-full border border-fd-border/70 bg-fd-background/60 px-2 py-0.5 font-mono text-[0.625rem] font-medium tracking-wider text-fd-muted-foreground uppercase">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-fd-primary"
                />
                demo
              </span>
            </div>

            <div className="relative rounded-[1.25rem] border border-fd-border/80 bg-fd-background/80 p-4 sm:p-6">
              <DemoS3Provider>
                <HomeDropzoneDemo />
              </DemoS3Provider>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
