import {
  ArrowRight,
  Blocks,
  Database,
  Download,
  Layers,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { DemoS3Provider } from "@/components/demo-s3-provider";
import { ObjectListDemo } from "@/components/demos/object-list-demo";
import { CodeShowcase } from "@/components/home/code-showcase";
import { InstallTabs } from "@/components/home/install-tabs";
import { LiveDemo } from "@/components/home/live-demo";
import { Logo } from "@/components/logo";
import {
  appName,
  githubRepoUrl,
  npmPackageUrls,
  siteTagline,
  xProfileUrl,
} from "@/lib/shared";

const githubUrl = githubRepoUrl();

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const features: {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
}[] = [
  {
    icon: ShieldCheck,
    title: "Server-owned keys",
    body: "The browser sends a route name. Your server picks the key and runs your guards.",
    href: "/docs/server/security",
  },
  {
    icon: Layers,
    title: "Multipart and resume",
    body: "Large files upload in parallel parts, and resume after a reload.",
    href: "/docs/react/upload-store",
  },
  {
    icon: Download,
    title: "Private downloads",
    body: "Short-lived signed links, or a fetch with progress and cancel.",
    href: "/docs/react/hooks/download",
  },
  {
    icon: Trash2,
    title: "Guarded deletes",
    body: "Deletes run on your server, only after your guards pass.",
    href: "/docs/server/hooks/delete",
  },
  {
    icon: Blocks,
    title: "Hooks and shadcn UI",
    body: "Headless hooks for your own UI, or components from the shadcn registry.",
    href: "/docs/react/ui",
  },
  {
    icon: Database,
    title: "Optional database",
    body: "Track ownership, folders, and usage, only when you need it.",
    href: "/docs/db",
  },
];

/** The tagline on two lines, from " for " on in the muted color. */
function HeroHeading() {
  const at = siteTagline.indexOf(" for ");
  if (at === -1) return siteTagline;

  return (
    <>
      <span className="sm:block">{siteTagline.slice(0, at)}</span>{" "}
      <span className="text-fd-muted-foreground sm:block">
        {siteTagline.slice(at + 1)}
      </span>
    </>
  );
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-[calc(100svh-var(--fd-banner-height,0px)-3.5rem)] flex-col justify-center"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-14 -z-10 h-128 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-fd-primary)_10%,transparent),transparent_70%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:gap-16">
        <div className="max-w-xl">
          <h1
            id="hero-heading"
            className="text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[2.875rem] xl:text-[3.25rem]"
          >
            <HeroHeading />
          </h1>
          <p className="mt-5 max-w-md text-lg leading-8 text-pretty text-fd-muted-foreground">
            Upload, download, and delete files in your own{" "}
            <span className="whitespace-nowrap">S3-compatible bucket</span>.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/docs/quickstart"
              className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground transition-colors hover:bg-fd-primary/90"
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
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-fd-border px-4 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent"
            >
              <SiGithub aria-hidden color="currentColor" className="size-4" />
              GitHub
            </a>
          </div>
        </div>
        <div className="w-full min-w-0 lg:justify-self-end">
          <LiveDemo />
        </div>
      </div>
    </section>
  );
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-fd-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id={id}
            className="text-3xl font-semibold tracking-tight text-balance"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-3 text-base leading-7 text-pretty text-fd-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <Hero />

      <Section
        id="files-heading"
        title="A file browser for your bucket"
        description="Folders, search, list and grid views, rename, and bulk delete."
      >
        <DemoS3Provider>
          {/* The docs demo caps its width; here it takes the section's. */}
          <div className="mx-auto max-w-4xl *:max-w-none">
            <ObjectListDemo />
          </div>
        </DemoS3Provider>
      </Section>

      <Section
        id="how-heading"
        title="Your server signs. The browser uploads."
        description="The browser gets a short-lived signed request and uploads straight to your bucket."
      >
        <div className="mx-auto max-w-3xl">
          <CodeShowcase />
        </div>
      </Section>

      <Section id="features-heading" title="The whole file lifecycle">
        <ul className="grid gap-x-12 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <li key={feature.title}>
              <Link href={feature.href} className="group block">
                <feature.icon
                  aria-hidden
                  strokeWidth={1.75}
                  className="size-5 text-fd-foreground"
                />
                <h3 className="mt-4 inline-flex items-center gap-1.5 font-medium">
                  {feature.title}
                  <ArrowRight
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-3.5 text-fd-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 rtl:rotate-180"
                  />
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-fd-muted-foreground">
                  {feature.body}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="start-heading"
        title="Start a new project"
        description="Scaffold a full-stack app with S3 routes and UI already set up."
      >
        <div className="mx-auto flex max-w-md flex-col items-center gap-6">
          <InstallTabs className="w-full" />
          <Link
            href="/docs/quickstart#manual-installation"
            className="group inline-flex items-center gap-1 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            Or add it to an existing app
            <ArrowRight
              aria-hidden
              strokeWidth={1.75}
              className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
            />
          </Link>
        </div>
      </Section>

      <footer className="border-t border-fd-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-fd-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Logo />
            <span className="font-medium text-fd-foreground">{appName}</span>
            <span aria-hidden>·</span>
            <span>MIT License</span>
          </div>
          <nav
            aria-label="Footer"
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            <Link
              href="/docs"
              className="transition-colors hover:text-fd-foreground"
            >
              Docs
            </Link>
            <Link
              href="/blog"
              className="transition-colors hover:text-fd-foreground"
            >
              Blog
            </Link>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-fd-foreground"
            >
              GitHub
            </a>
            <a
              href={npmPackageUrls[0]}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-fd-foreground"
            >
              npm
            </a>
            <a
              href={xProfileUrl}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-fd-foreground"
            >
              X
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
