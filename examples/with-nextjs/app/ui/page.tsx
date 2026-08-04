"use client";

import Link from "next/link";
import { localStorageStore } from "@/lib/upload-store";
import { ExampleSection } from "@/components/example-section";
import { LocaleToggle } from "@/components/s3-provider";
import {
  UploadButton,
  UploadDropzone,
  DownloadButton,
  ProgressDownloadButton,
  DeleteButton,
} from "@dimah-s3/ui";

const MB = 1024 * 1024;

export default function UiExamplesPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 p-8">
      <header>
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-600">
            ← Home
          </Link>
          <LocaleToggle />
        </div>
        <h1 className="mt-2 text-2xl font-bold">@dimah-s3/ui</h1>
        <p className="text-sm text-zinc-500">
          Pre-built components from the <code>@dimah-s3/ui</code> npm package.
          Toggle locale to try English LTR vs Persian RTL UI strings.
        </p>
      </header>

      <ExampleSection
        title="Basic upload"
        code={`<UploadDropzone
  objectKey={(file) => \`uploads/\${file.name}\`}
/>`}
      >
        <UploadDropzone objectKey={(file: File) => `uploads/${file.name}`} />
      </ExampleSection>

      <ExampleSection
        title="Multi-file upload"
        code={`<UploadDropzone
  objectKey={(file) => \`uploads/\${Date.now()}-\${file.name}\`}
  maxFiles={5}
  accept={["image/*"]}
/>`}
      >
        <UploadDropzone
          objectKey={(file: File) => `uploads/${Date.now()}-${file.name}`}
          maxFiles={5}
          accept={["image/*"]}
        />
      </ExampleSection>

      <ExampleSection
        title="Resumable multipart"
        badge="uploadStore"
        desc={
          <>
            Files above 2 MB use multipart. <code>uploadId</code> is stored in{" "}
            <code>localStorage</code> — use pause to keep parts, or cancel to
            abort. Re-select the same file to resume after pause.
          </>
        }
        code={`<UploadDropzone
  objectKey={(file) => \`uploads/\${file.name}\`}
  multipart
  multipartThreshold={2 * MB}
  uploadStore={localStorageStore}
/>`}
      >
        <UploadDropzone
          objectKey={(file: File) => `uploads/${file.name}`}
          multipart
          multipartThreshold={2 * MB}
          uploadStore={localStorageStore}
        />
      </ExampleSection>

      <ExampleSection
        title="Button appearance"
        desc={
          <>
            All action buttons accept shadcn <code>variant</code>,{" "}
            <code>size</code>, and <code>buttonClassName</code>.
          </>
        }
        code={`<UploadButton variant="secondary" size="sm" objectKey="uploads/file" />
<DownloadButton variant="ghost" objectKey="uploads/sample.pdf" />
<DeleteButton variant="outline" objectKey="uploads/sample.pdf" />`}
      >
        <div className="flex flex-wrap gap-3">
          <UploadButton
            variant="secondary"
            size="sm"
            objectKey={(file: File) => `uploads/${file.name}`}
          />
          <DownloadButton variant="ghost" objectKey="uploads/sample.pdf" />
          <DeleteButton variant="outline" objectKey="uploads/sample.pdf" />
        </div>
      </ExampleSection>

      <ExampleSection
        title="Download & delete"
        desc={
          <>
            Replace <code>objectKey</code> with a key you uploaded in this
            bucket.
          </>
        }
        code={`<DownloadButton objectKey="uploads/your-file.jpg" />
<ProgressDownloadButton objectKey="uploads/your-file.jpg" />
<DeleteButton objectKey="uploads/your-file.jpg" />`}
      >
        <div className="flex flex-wrap gap-3">
          <DownloadButton objectKey="uploads/sample.pdf" />
          <ProgressDownloadButton
            objectKey="uploads/sample.pdf"
            label="Download with progress"
          />
          <DeleteButton objectKey="uploads/sample.pdf" />
        </div>
      </ExampleSection>
    </main>
  );
}
