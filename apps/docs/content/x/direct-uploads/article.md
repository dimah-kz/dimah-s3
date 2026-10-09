---
slug: direct-uploads
canonical: https://s3.dimah.dev/blog/direct-uploads
title: Direct uploads to a bucket you own
subtitle: The server signs a short-lived URL. The browser talks to your bucket. Credentials stay on the server.
date: 2026-10-09
---

dimah-s3 is a full-stack S3 toolkit for React and Node.js. You bring an S3-compatible bucket and an AWS SDK client.

https://s3.dimah.dev/blog/direct-uploads

## What you get

- **Full lifecycle.** Upload, download, and delete, including multipart, on one named route.
- **Server hooks.** Auth, quotas, and confirmation stay on the server.
- **React.** Headless hooks, and optional shadcn UI.
- **Optional database.** Ownership and listings when an object needs them.

List, copy, and tagging stay in your own code with the AWS SDK.

## Setup

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

export const s3 = dimahS3({
  client: new S3Client({/* env */}),
  bucket: process.env.S3_BUCKET!,
  routes: {
    uploads: route({
      upload: { fileTypes: ["image/*"] },
      download: true,
    }),
  },
});
```

Mount the handler with the adapter for your framework: Next.js, Hono, Express, Fastify, Elysia, SvelteKit, or Node. On the client, `useUpload({ route: "uploads" })` comes from `@dimah-s3/react`. Dropzones and buttons are in `@dimah-s3/ui`.

Scaffold a project with the routes and UI already in place:

```bash
npx @dimah-s3/cli@latest create my-app
```

## When to use it

Choose dimah-s3 when the bucket is yours and the app needs that lifecycle.

Choose Better Upload for a smaller upload-focused toolkit on your own bucket. Choose UploadThing for managed storage. Choose Uppy for a client uploader on a backend you provide.

Comparison: https://s3.dimah.dev/docs/comparison
Docs: https://s3.dimah.dev/docs
Quickstart: https://s3.dimah.dev/docs/quickstart
Agent index: https://s3.dimah.dev/llms.txt
Source: https://github.com/dimah-kz/dimah-s3
