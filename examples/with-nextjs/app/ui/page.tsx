"use client";

import Link from "next/link";
import { ExampleSection } from "@/components/example-section";
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
        <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-600">
          ← Home
        </Link>
        <h1 className="mt-2 text-2xl font-bold">@dimah-s3/ui</h1>
        <p className="text-sm text-zinc-500">
          Pre-built components from the <code>@dimah-s3/ui</code> npm package.
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
        title="Multipart upload"
        code={`<UploadDropzone
  objectKey={(file) => \`uploads/\${file.name}\`}
  multipart
  multipartThreshold={2 * MB}
/>`}
      >
        <UploadDropzone
          objectKey={(file: File) => `uploads/${file.name}`}
          multipart
          multipartThreshold={2 * MB}
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
