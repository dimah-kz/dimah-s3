import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { cn } from "cn";
import { DemoS3Provider } from "@/components/demo-s3-provider";
import { HomeDropzoneDemo } from "@/components/demos/home-dropzone-demo";
import { githubRepoUrl, siteTagline } from "@/lib/shared";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const githubUrl = githubRepoUrl();

function HeroHeading() {
  const bridge = " for ";
  const bridgeAt = siteTagline.indexOf(bridge);
  const lead = bridgeAt === -1 ? siteTagline : siteTagline.slice(0, bridgeAt);
  const tail =
    bridgeAt === -1 ? null : siteTagline.slice(bridgeAt + bridge.length);
  const accent = "S3";
  const accentAt = lead.indexOf(accent);
  const leadNode =
    accentAt === -1 ? (
      lead
    ) : (
      <>
        {lead.slice(0, accentAt)}
        <span className="text-fd-primary italic">{accent}</span>
        {lead.slice(accentAt + accent.length)}
      </>
    );

  if (tail == null) return leadNode;

  return (
    <>
      <span className="block">{leadNode}</span>
      <span className="block">for {tail}</span>
    </>
  );
}

export default function HomePage() {
  return (
    <div className="relative flex flex-1 flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-14 -z-10 h-128 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-fd-primary)_11%,transparent),transparent_70%)]"
      />

      <section
        aria-labelledby="hero-heading"
        className="mx-auto flex w-full max-w-[75rem] flex-1 flex-col justify-center-safe px-6 py-16 sm:py-20"
      >
        <div className="grid w-full items-center gap-14 lg:translate-y-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,32rem)] lg:gap-x-16 xl:grid-cols-[minmax(0,32rem)_32rem] xl:gap-x-32">
          <div className="max-w-xl">
            <h1
              id="hero-heading"
              className={cn(
                display.className,
                "text-[2.55rem] leading-[1.02] font-normal tracking-[-0.02em] text-fd-foreground sm:text-6xl lg:text-[3.7rem] xl:text-[4rem]",
              )}
            >
              <HeroHeading />
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-pretty text-fd-muted-foreground">
              Minimal setup, powered by the AWS SDK (v3).
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-2.5">
              <Link
                href="/docs/quickstart"
                className="group inline-flex h-10 items-center justify-center gap-2 rounded-md bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
              >
                Get started
                <ArrowRight
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
                />
              </Link>
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex h-10 items-center justify-center gap-2 rounded-md border border-fd-border px-4 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-muted"
              >
                <SiGithub aria-hidden color="currentColor" className="size-4" />
                View on GitHub
                <ArrowUpRight
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-3.5 text-fd-muted-foreground transition-transform duration-200 group-hover:translate-x-px group-hover:-translate-y-px"
                />
              </a>
            </div>
          </div>

          <div className="min-w-0 border-t border-fd-border pt-10 lg:border-t-0 lg:pt-0">
            <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-muted/40">
              <div className="flex items-center gap-3 border-b border-fd-border/80 px-3.5 py-2.5">
                <span aria-hidden className="flex items-center gap-1.5">
                  <span className="size-1.75 rounded-full bg-[#ff5f57]" />
                  <span className="size-1.75 rounded-full bg-[#febc2e]" />
                  <span className="size-1.75 rounded-full bg-[#28c840]" />
                </span>
                <span className="ms-auto inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.14em] text-fd-muted-foreground uppercase">
                  <span
                    aria-hidden
                    className="size-1.5 animate-pulse rounded-full bg-fd-primary motion-reduce:animate-none"
                  />
                  Demo
                </span>
              </div>
              <div className="p-4 sm:p-5">
                <DemoS3Provider>
                  <HomeDropzoneDemo />
                </DemoS3Provider>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-fd-border">
        <div className="mx-auto flex w-full max-w-[75rem] flex-col gap-3 px-6 py-5 text-[13px] text-fd-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Released under the MIT License.</p>
          <nav aria-label="Footer" className="flex items-center gap-5">
            <Link
              href="/docs"
              className="transition-colors hover:text-fd-foreground"
            >
              Documentation
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-fd-foreground"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
