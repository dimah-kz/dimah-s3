import {
  ArrowRight,
  Blocks,
  Check,
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
import { cn } from "cn";
import { DemoS3Provider } from "@/components/demo-s3-provider";
import { ObjectListDemo } from "@/components/demos/object-list-demo";
import { CodeShowcase } from "@/components/home/code-showcase";
import { InstallCommand } from "@/components/home/install-command";
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
const createCommand = "npx @dimah-s3/cli@beta create";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const stack = {
  storage: [
    { name: "Amazon S3", href: "/docs/providers/aws-s3" },
    { name: "Cloudflare R2", href: "/docs/providers/cloudflare-r2" },
    { name: "MinIO", href: "/docs/providers/minio" },
  ],
  servers: ["Next.js", "Hono", "Express", "Fastify", "Elysia", "SvelteKit"],
};

const steps = [
  {
    title: "Define a route",
    body: "File types, size limits, and guards live on the server, next to your auth.",
  },
  {
    title: "Mount one handler",
    body: "A catch-all route for Next.js, Hono, Express, Fastify, Elysia, or SvelteKit.",
  },
  {
    title: "Upload from React",
    body: "Headless hooks for your own UI, or ready-made shadcn components.",
  },
];

const objectListFeatures = [
  "Folders and breadcrumbs",
  "Search and sort",
  "List and grid views",
  "Keyboard navigation",
  "Rename files and folders",
  "Select and bulk delete",
  "Upload into the open folder",
  "Storage usage meter",
];

const features: {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
}[] = [
  {
    icon: ShieldCheck,
    title: "Server-owned keys",
    body: "The browser sends a route name. Your server picks the key, runs guards, and verifies the stored object.",
    href: "/docs/server/security",
  },
  {
    icon: Layers,
    title: "Multipart and resume",
    body: "Large files upload in parallel parts with retries, and resume after a reload with an upload store.",
    href: "/docs/react/upload-store",
  },
  {
    icon: Download,
    title: "Private downloads",
    body: "Short-lived signed links, or a fetch with progress and cancel. Proxy through your server when needed.",
    href: "/docs/react/hooks/download",
  },
  {
    icon: Trash2,
    title: "Guarded deletes",
    body: "Deletes run on your server after the guards pass, with hooks for cleanup once S3 removes the object.",
    href: "/docs/server/hooks/delete",
  },
  {
    icon: Blocks,
    title: "Hooks and shadcn UI",
    body: "Build on headless hooks, or add accessible components from npm or the shadcn registry.",
    href: "/docs/react/ui",
  },
  {
    icon: Database,
    title: "Optional database",
    body: "Track ownership, folders, and usage with @dimah-s3/db, only when your app needs it.",
    href: "/docs/db",
  },
];

/** The tagline, with everything from " for " on in the muted color. */
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

function HeroBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-14 bottom-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 [background-image:linear-gradient(to_right,var(--color-fd-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-fd-border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_30%,transparent_100%)] [background-size:56px_56px] opacity-60" />
      <div className="absolute -top-56 left-1/2 h-144 w-5xl -translate-x-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-fd-primary)_16%,transparent),transparent)]" />
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("max-w-xl", className)}>
      <p className="text-sm font-medium text-fd-primary">{eyebrow}</p>
      <h2
        id={id}
        className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
      >
        {title}
      </h2>
      {children ? (
        <p className="mt-3 text-base leading-7 text-pretty text-fd-muted-foreground">
          {children}
        </p>
      ) : null}
    </div>
  );
}

function PrimaryLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-fd-primary px-4 text-sm font-medium text-fd-primary-foreground shadow-sm transition-colors hover:bg-fd-primary/90"
    >
      {children}
      <ArrowRight
        aria-hidden
        strokeWidth={1.75}
        className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
      />
    </Link>
  );
}

function TextLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-1 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground"
    >
      {children}
      <ArrowRight
        aria-hidden
        strokeWidth={1.75}
        className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
      />
    </Link>
  );
}

function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-[calc(100svh-var(--fd-banner-height,0px)-3.5rem)] flex-col"
    >
      <HeroBackdrop />
      <div className="mx-auto grid w-full max-w-6xl flex-1 content-center items-center gap-14 px-6 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] xl:gap-16">
        <div className="max-w-xl">
          <Link
            href="/docs/migration-2-0"
            className="group inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/70 py-1 ps-1 pe-3 text-xs text-fd-muted-foreground backdrop-blur transition-colors hover:text-fd-foreground"
          >
            <span className="rounded-full bg-fd-primary/15 px-2 py-0.5 font-medium text-fd-primary">
              2.0 beta
            </span>
            Upgrading from 1.x? Read the guide
            <ArrowRight
              aria-hidden
              strokeWidth={1.75}
              className="size-3 transition-transform duration-200 group-hover:translate-x-0.5 rtl:rotate-180"
            />
          </Link>
          <h1
            id="hero-heading"
            className="mt-6 text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[2.875rem] xl:text-[3.25rem]"
          >
            <HeroHeading />
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-pretty text-fd-muted-foreground">
            Upload, download, and delete files in your own S3-compatible bucket.
            Typed server routes, headless React hooks, and optional shadcn UI,
            on the AWS SDK client you already have.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <PrimaryLink href="/docs/quickstart">Get started</PrimaryLink>
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-fd-border bg-fd-background/80 px-4 text-sm font-medium text-fd-foreground backdrop-blur transition-colors hover:bg-fd-accent"
            >
              <SiGithub aria-hidden color="currentColor" className="size-4" />
              GitHub
            </a>
          </div>
          <InstallCommand command={createCommand} className="mt-5" />
        </div>
        <div className="relative w-full min-w-0 lg:justify-self-end">
          <div
            aria-hidden
            className="absolute -inset-6 -z-10 rounded-[2rem] bg-fd-primary/8 blur-2xl"
          />
          <LiveDemo />
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl px-6 pb-8">
        <div className="flex flex-col gap-3 border-t border-fd-border pt-6 sm:flex-row sm:items-center sm:gap-8">
          <p className="shrink-0 text-xs font-medium tracking-wider text-fd-muted-foreground uppercase">
            Works with
          </p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-fd-muted-foreground">
            {stack.storage.map((item) => (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className="transition-colors hover:text-fd-foreground"
                >
                  {item.name}
                </Link>
              </li>
            ))}
            <li aria-hidden className="h-4 w-px bg-fd-border" />
            {stack.servers.map((name) => (
              <li key={name}>
                <Link
                  href="/docs/server/setup"
                  className="transition-colors hover:text-fd-foreground"
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <Hero />

      <section
        aria-labelledby="how-heading"
        className="border-t border-fd-border"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16 lg:py-24">
          <div>
            <SectionHeading
              id="how-heading"
              eyebrow="How it works"
              title="Your server signs. The browser uploads."
            >
              The client asks for a route by name and gets a short-lived signed
              request. Bytes go straight to your bucket, and S3 credentials
              never leave the server.
            </SectionHeading>
            <ol className="mt-8 flex flex-col gap-5">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden
                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-fd-border bg-fd-card font-mono text-xs text-fd-muted-foreground"
                  >
                    {index + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-fd-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="min-w-0">
            <CodeShowcase />
          </div>
        </div>
      </section>

      <section
        aria-labelledby="files-heading"
        className="border-t border-fd-border bg-fd-muted/30"
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <SectionHeading
              id="files-heading"
              eyebrow="Object list"
              title="A file browser for your bucket"
            >
              One component on top of your own data source. Try it: open a
              folder, search, switch views, rename, or drop files in.
            </SectionHeading>
            <TextLink href="/docs/react/ui/components/object-list">
              Object list docs
            </TextLink>
          </div>
          <div className="mt-10 rounded-2xl border border-fd-border bg-fd-background p-2 shadow-sm sm:p-3">
            <DemoS3Provider>
              {/* The docs demo caps its width; here it fills the frame. */}
              <div className="*:max-w-none">
                <ObjectListDemo />
              </div>
            </DemoS3Provider>
          </div>
          <ul className="mt-8 grid gap-x-8 gap-y-3 text-sm text-fd-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            {objectListFeatures.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5">
                <Check
                  aria-hidden
                  strokeWidth={2}
                  className="size-4 shrink-0 text-fd-primary"
                />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="features-heading"
        className="border-t border-fd-border"
      >
        <div className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24">
          <SectionHeading
            id="features-heading"
            eyebrow="Features"
            title="The whole file lifecycle, not just the picker"
          >
            Presigned upload, download, and delete, with the server hooks around
            them. Everything else stays in your code with the AWS SDK.
          </SectionHeading>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-xl border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <li key={feature.title} className="flex">
                <Link
                  href={feature.href}
                  className="group flex w-full flex-col gap-3 bg-fd-background p-6 transition-colors outline-none hover:bg-fd-muted/40 focus-visible:bg-fd-muted/40"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg border border-fd-border bg-fd-card">
                    <feature.icon
                      aria-hidden
                      strokeWidth={1.75}
                      className="size-4.5 text-fd-foreground"
                    />
                  </span>
                  <span className="mt-1 font-medium">{feature.title}</span>
                  <span className="text-sm leading-6 text-fd-muted-foreground">
                    {feature.body}
                  </span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm text-fd-muted-foreground transition-colors group-hover:text-fd-foreground">
                    Read the docs
                    <ArrowRight
                      aria-hidden
                      strokeWidth={1.75}
                      className="size-3.5 rtl:rotate-180"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="start-heading"
        className="border-t border-fd-border bg-fd-muted/30"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-16 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-lg">
            <h2
              id="start-heading"
              className="text-2xl font-semibold tracking-tight text-balance"
            >
              Add uploads in a few minutes
            </h2>
            <p className="mt-2 text-base leading-7 text-fd-muted-foreground">
              Scaffold a starter, or follow the quickstart in an existing app.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto">
            <InstallCommand command={createCommand} className="sm:w-88" />
            <PrimaryLink href="/docs/quickstart">Quickstart</PrimaryLink>
          </div>
        </div>
      </section>

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
