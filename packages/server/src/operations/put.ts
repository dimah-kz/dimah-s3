import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import {
  buildContentDisposition,
  s3Error,
  uploadBodySchema,
  type ConfirmedObjectResponse,
} from "@dimah-s3/core";
import { finalizeConfirmed } from "@/helpers/finalize-confirmed";
import { headObjectOrNotFound } from "@/helpers/head-object";
import { runGuards, runLifecycle } from "@/helpers/hooks";
import { buildObjectMetadata } from "@/helpers/object-meta";
import { objectCommandExtras } from "@/helpers/object-s3";
import { openUploadTarget } from "@/helpers/resolve-route";
import { runOperation } from "@/operations/run-operation";
import {
  assertSingleUploadSize,
  DEFAULT_CONTENT_TYPE,
} from "@/operations/upload";
import type { PutInput, S3ServerCallOptions } from "@/types/config";
import type { ResolvedConfig } from "@/types/resolved";

/** How long a db row may stay pending for an `s3.put` upload. */
const PUT_EXPIRES_IN_MS = 15 * 60 * 1000;

/** The same rules as a presign body: route name, file name, size and type. */
const putFileSchema = uploadBodySchema.pick({
  route: true,
  name: true,
  size: true,
  type: true,
});

type PutBody = Uint8Array | ReadableStream<Uint8Array>;

/**
 * Uploads from the server (`s3.put`) through the same route policy as a
 * presigned upload.
 *
 * It opens the route, runs `upload.object()` and `upload.guard`, then
 * `upload.onStart` (`kind: "server"`). A throw from `onStart` skips the
 * PutObject. The body streams to PutObject with `Content-Disposition` and
 * the upload marker, and then {@link finalizeConfirmed} checks the object
 * and runs `upload.onConfirmed`. `confirmGuard` does not run.
 *
 * `input.metadata` is written to S3 on top of `upload.object().metadata`.
 * `input.clientMetadata` reaches the hooks and is never written.
 */
export async function putObject(
  config: ResolvedConfig,
  input: PutInput,
  options: S3ServerCallOptions = {},
): Promise<ConfirmedObjectResponse> {
  const { body, size } = readBody(input);
  const file = parsePutFile({
    route: input.route,
    name: input.name,
    size,
    type: input.type,
  });
  assertSingleUploadSize(file.size);

  return runOperation(config, "put", options, async (call) => {
    const target = await openUploadTarget(
      config,
      call,
      {
        route: file.route,
        file: { name: file.name, size: file.size, type: file.type },
        clientMetadata: input.clientMetadata,
      },
      "server",
    );
    const { route, object, uploadToken } = target;
    const metadata = input.metadata
      ? { ...object.metadata, ...input.metadata }
      : object.metadata;
    const s3Metadata = input.metadata
      ? buildObjectMetadata({
          metadata,
          uploadToken,
          previousKey: object.previousKey,
        })
      : target.s3Metadata;
    const context = { ...target.context, metadata };

    await runGuards(route.upload.guard, context);
    await runLifecycle(route.upload.onStart, {
      ...context,
      uploadToken,
      expiresAt: new Date(Date.now() + PUT_EXPIRES_IN_MS),
    });

    await route.client.send(
      new PutObjectCommand({
        Bucket: object.bucket,
        Key: object.key,
        Body: sdkBody(route.client, body),
        ContentLength: file.size,
        ContentType: file.type ?? DEFAULT_CONTENT_TYPE,
        ContentDisposition: buildContentDisposition(file.name),
        ACL: object.acl,
        Metadata: s3Metadata,
        ...objectCommandExtras(object),
      }),
      { abortSignal: call.request.signal },
    );

    const head = await headObjectOrNotFound(
      route.client,
      object.bucket,
      object.key,
    );
    return finalizeConfirmed({
      route,
      context,
      kind: "server",
      uploadToken,
      file: context.file,
      acl: object.acl,
      head,
    });
  });
}

/**
 * The body as bytes or a web stream, and its size. A `ReadableStream`
 * needs `input.size`; for any other body, `input.size` must match it.
 */
function readBody(input: PutInput): { body: PutBody; size: number } {
  const { body } = input;
  let normalized: { body: PutBody; size: number | undefined };
  if (typeof body === "string") {
    const bytes = new TextEncoder().encode(body);
    normalized = { body: bytes, size: bytes.byteLength };
  } else if (body instanceof ArrayBuffer) {
    normalized = { body: new Uint8Array(body), size: body.byteLength };
  } else if (body instanceof Uint8Array) {
    normalized = { body, size: body.byteLength };
  } else if (body instanceof Blob) {
    normalized = { body: body.stream(), size: body.size };
  } else {
    normalized = { body, size: undefined };
  }

  if (normalized.size === undefined) {
    if (input.size === undefined) {
      throw invalidPut("size is required for a ReadableStream body");
    }
    return { body: normalized.body, size: input.size };
  }
  if (input.size !== undefined && input.size !== normalized.size) {
    throw invalidPut(
      `size is ${input.size}, but the body has ${normalized.size} bytes`,
    );
  }
  return { body: normalized.body, size: normalized.size };
}

function parsePutFile(value: unknown) {
  const result = putFileSchema.safeParse(value);
  if (result.success) return result.data;
  throw invalidPut(
    result.error.issues
      .map((issue) =>
        issue.path.length > 0
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message,
      )
      .join("; "),
  );
}

function invalidPut(issue: string) {
  return s3Error("VALIDATION_ERROR", { issue: `s3.put: ${issue}` });
}

/**
 * The PutObject body. The SDK's Node handlers send bytes and Node streams
 * only, so a web stream becomes a Node `Readable` there. Fetch-based
 * handlers take the web stream as it is.
 */
function sdkBody(client: S3Client, body: PutBody) {
  if (body instanceof Uint8Array) return body;
  const handler: { metadata?: { handlerProtocol?: string } } | undefined =
    client.config.requestHandler;
  const protocol = handler?.metadata?.handlerProtocol;
  const nodeStream =
    protocol === "http/1.1" || protocol === "h2"
      ? globalThis.process?.getBuiltinModule?.("node:stream")
      : undefined;
  // The DOM and Node typings of ReadableStream differ; the runtime object is the same.
  return nodeStream
    ? nodeStream.Readable.fromWeb(body as NodeReadableStream<Uint8Array>)
    : body;
}
