---
slug: choose-the-layer
canonical: https://s3.dimah.dev/blog/choose-the-layer
title: Direct S3 uploads for React, on a bucket you control
subtitle: The server signs, the browser talks to your bucket, and download and delete stay on the same route.
date: 2026-10-09
---

The canonical note is https://s3.dimah.dev/blog/choose-the-layer. This is the longer version.

dimah-s3 is a TypeScript toolkit for apps that already have an S3-compatible bucket. The server signs a short-lived request. The browser uploads straight to the bucket. Credentials stay on the backend.

It is the layer around the life of the object: upload, confirmation, download, and delete, plus optional shadcn UI and an optional database plugin. You pass your own AWS SDK `S3Client`. Auth and quotas stay in hooks you write. The license is MIT.

Amazon S3, Cloudflare R2, MinIO, Wasabi, DigitalOcean Spaces, and any other S3-compatible API work. You configure the client. R2 upload routes use `method: "PUT"`. MinIO usually needs `forcePathStyle: true`.

## The contract

The client sends a route name. It does not choose the object key. The server owns keys under that route's prefix. The default shape is `{keyPrefix}/{uuid}/{name}`.

Size and type are trusted after `HeadObject`, in `onConfirmed`, not from the body that asked for the signature. If verification or your confirm hook fails, the object is removed.

`fileTypes` checks the Content-Type header and the filename. It does not sniff bytes. Without the database plugin, a download can still presign an unconfirmed key under that prefix. Enforce ownership in a guard, or with `db()`, when it matters.

List, copy, retention, tagging, and image or video transforms stay in your own AWS SDK code.

## A minimal server

```ts
import { S3Client } from "@aws-sdk/client-s3";
import { dimahS3, route } from "@dimah-s3/server";

export const s3 = dimahS3({
  client: new S3Client({/* region, endpoint, credentials from env */}),
  bucket: process.env.S3_BUCKET!,
  routes: {
    avatar: route({
      upload: {
        fileTypes: ["image/*"],
        maxFileSize: 2 * 1024 * 1024,
      },
      download: true,
    }),
  },
});
```

Mount it with the adapter you already run: Next.js, Hono, Express, Fastify, Elysia, SvelteKit, Node, or Fetch. On the client, `@dimah-s3/react` is the headless hook, `useUpload({ route: "avatar" })`. `@dimah-s3/ui` adds shadcn dropzones and buttons when you want them.

Or scaffold a starter (Next.js, Vite + Hono, or Hono):

```bash
npx @dimah-s3/cli@latest create my-app
```

You still own bucket CORS, the IAM policy, and the hooks that decide who may call a route.

## Choose the layer first

A bucket you control, a managed file service, and a client uploader are different jobs.

Choose dimah-s3 when the bucket is yours and you need one policy for the life of the object: verified confirmation, private download, guarded delete, multipart that resumes after the same file is reselected, or optional database tracking.

Choose Better Upload when you own the bucket and the product boundary is the upload. It also speaks S3, including multipart. A move means adapting server and client code. The contracts differ.

Choose UploadThing when storage and delivery should be operated for you. You skip the bucket, IAM, and CORS, and you pay a managed plan. Self-hosting still costs storage, transfer, compute, and maintenance.

Choose Uppy when the signing backend is already yours and you want its Dashboard, remote sources, or Tus. Its S3 plugin expects Uppy's signing contract. dimah-s3 expects a route name and a server-owned key.

Choose the AWS SDK alone when you have one small upload and you want to own every endpoint.

The matrix is https://s3.dimah.dev/docs/comparison.

Docs: https://s3.dimah.dev/docs
Agent index: https://s3.dimah.dev/llms.txt
Source: https://github.com/dimah-kz/dimah-s3
