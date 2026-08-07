import Link from "next/link";
import { DemoPreview } from "@/components/demo-preview";
import { UploadDropzoneDemo } from "@/components/demos/upload-dropzone-demo";
import { buttonVariants } from "@/components/ui/button";
import { gitConfig } from "@/lib/shared";

const githubUrl = `https://github.com/${gitConfig.user}/${gitConfig.repo}`;

export default function HomePage() {
  return (
    <section className="mx-auto flex w-full min-w-0 max-w-6xl flex-1 items-center px-4 py-10 sm:px-6 sm:py-16 lg:px-14">
      <div className="grid w-full min-w-0 grid-cols-1 items-center gap-8 sm:gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
        <div className="min-w-0 max-w-xl space-y-5 sm:space-y-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-fd-foreground sm:text-4xl lg:text-5xl">
            dimah-s3
          </h1>
          <p className="text-pretty text-base leading-relaxed tracking-tight text-fd-muted-foreground sm:text-lg sm:leading-8 lg:text-xl">
            Full-stack object lifecycle with server and React hooks.
            <br />
            Minimal setup, powered by the AWS SDK (v3).
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link
              href="/docs/quickstart"
              className={buttonVariants({
                size: "lg",
                className:
                  "h-11 gap-2 px-5 text-sm sm:h-12 sm:px-6 sm:text-base",
              })}
            >
              Get Started
            </Link>
            <Link
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({
                variant: "ghost",
                size: "lg",
                className:
                  "h-11 gap-2 px-5 text-sm sm:h-12 sm:px-6 sm:text-base",
              })}
            >
              View on GitHub
            </Link>
          </div>
        </div>

        <div className="min-w-0 w-full">
          <DemoPreview name="upload-dropzone-demo.tsx">
            <UploadDropzoneDemo />
          </DemoPreview>
        </div>
      </div>
    </section>
  );
}
