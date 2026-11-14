import { cacheLife } from "next/cache";
import {
  CodeBlockTab,
  CodeBlockTabs,
  CodeBlockTabsList,
  CodeBlockTabsTrigger,
} from "fumadocs-ui/components/codeblock";
import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";

const files = [
  {
    name: "lib/s3.ts",
    lang: "ts",
    code: `import { dimahS3, route, s3Error } from "@dimah-s3/server";
import { awsS3 } from "./aws-s3";
import { getSession } from "./auth";

export const s3 = dimahS3({
  client: awsS3,
  bucket: process.env.S3_BUCKET!,
  routes: {
    avatar: route({
      guard: async ({ request }) => {
        const session = await getSession(request);
        if (!session) throw s3Error("UNAUTHORIZED");
      },
      upload: {
        fileTypes: ["image/*"],
        maxFileSize: 2 * 1024 * 1024, // 2MB
      },
      download: true,
      delete: true,
    }),
  },
});`,
  },
  {
    name: "app/api/s3/[...s3]/route.ts",
    lang: "ts",
    code: `import { toNextJsHandler } from "@dimah-s3/server/next";
import { s3 } from "@/lib/s3";

export const { GET, POST, PUT, PATCH, DELETE } = toNextJsHandler(s3);`,
  },
  {
    name: "components/avatar-upload.tsx",
    lang: "tsx",
    code: `"use client";

import { useUpload } from "@dimah-s3/react";
import {
  Upload,
  UploadDropzone,
  UploadDropzoneTrigger,
  UploadStatus,
} from "@dimah-s3/ui";

export function AvatarUpload() {
  const upload = useUpload({ route: "avatar" });

  return (
    <Upload upload={upload}>
      <UploadDropzone>
        <UploadDropzoneTrigger />
        <UploadStatus />
      </UploadDropzone>
    </Upload>
  );
}`,
  },
] as const;

/** Highlighting runs once at build time; the page stays fully static. */
async function CachedCode({ code, lang }: { code: string; lang: string }) {
  "use cache";
  cacheLife("max");

  return (
    <ServerCodeBlock
      code={code}
      lang={lang}
      codeblock={{
        className: "border-0",
        viewportProps: { className: "max-h-none" },
      }}
    />
  );
}

/** Server route, handler, and client component as one tabbed code block. */
export function CodeShowcase() {
  return (
    <CodeBlockTabs
      defaultValue={files[0].name}
      className="my-0 overflow-hidden shadow-sm"
    >
      <CodeBlockTabsList className="border-b border-fd-border">
        {files.map((file) => (
          <CodeBlockTabsTrigger key={file.name} value={file.name}>
            {file.name}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {files.map((file) => (
        <CodeBlockTab key={file.name} value={file.name}>
          <CachedCode code={file.code} lang={file.lang} />
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}
