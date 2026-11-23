import {
  createS3Client,
  sha256Base64,
  type CreateS3ClientOptions,
  type CreateS3ClientResult,
  type S3Api,
  type S3ClientPlugin,
  type S3RequestOptions,
  type UploadConfirmResponse,
} from "@dimah-s3/core";
import type { MemoryS3 } from "./memory-s3";

/** Origin of the requests a test client sends. The handler reads only the path. */
const TEST_ORIGIN = "http://localhost";

/** What a test client calls: a `dimahS3()` instance, or anything with its `handler`. */
export type TestHandler = { handler: (request: Request) => Promise<Response> };

/** {@link createS3Client} options, without `baseURL` and `fetch`. */
export type TestClientOptions<P extends readonly S3ClientPlugin[]> = Omit<
  CreateS3ClientOptions<P>,
  "baseURL" | "fetch"
>;

/**
 * The browser client of `@dimah-s3/core`, wired to `s3.handler` in process:
 * every call goes through the router, the guards, and the plugin endpoints
 * as a real request would, with no server and no network. Pass client
 * plugins as you would to `createS3Client`, and `basePath` when the
 * instance sets one.
 *
 * ```ts
 * const client = createTestClient(s3, { plugins: [auditClient()] });
 * await client.audit.listEvents();
 * ```
 */
export function createTestClient<
  const P extends readonly S3ClientPlugin[] = [],
>(s3: TestHandler, options?: TestClientOptions<P>): CreateS3ClientResult<P> {
  return createS3Client<P>({
    ...options,
    fetch: (input, init) => s3.handler(toRequest(input, init)),
  });
}

function toRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) return new Request(input, init);
  return new Request(new URL(String(input), TEST_ORIGIN), init);
}

/** One file for {@link uploadTestFile}. */
export type TestUploadInput = {
  route: string;
  name: string;
  body: string | Uint8Array | ArrayBuffer;
  /** MIME type the client declares and S3 stores. */
  type?: string;
  /**
   * Size the client declares. Defaults to the body's. Declare another to
   * test a size mismatch, which confirm rejects.
   */
  size?: number;
  clientMetadata?: Record<string, string>;
};

/**
 * Uploads one file the way the browser does: presign, store the bytes in
 * `storage` with the presigned headers or form fields, then confirm. The
 * upload hooks run as they do in production. It sends the file's SHA-256,
 * so it works on a route that requires checksums. Rejects with the
 * `APIError` of the step that fails.
 *
 * ```ts
 * const object = await uploadTestFile({ client, storage }, {
 *   route: "uploads",
 *   name: "a.txt",
 *   body: "hello",
 * });
 * ```
 */
export async function uploadTestFile(
  target: { client: Pick<S3Api, "upload" | "confirm">; storage: MemoryS3 },
  input: TestUploadInput,
  options?: S3RequestOptions,
): Promise<UploadConfirmResponse> {
  const bytes = toBytes(input.body);
  const presigned = await target.client.upload(
    {
      route: input.route,
      name: input.name,
      size: input.size ?? bytes.byteLength,
      ...(input.type !== undefined && { type: input.type }),
      ...(input.clientMetadata !== undefined && {
        clientMetadata: input.clientMetadata,
      }),
      checksum: await sha256Base64(bytes),
    },
    options,
  );
  await target.storage.receiveUpload({
    key: presigned.key,
    bucket: presigned.bucket,
    body: bytes,
    headers: presigned.method === "PUT" ? presigned.headers : presigned.fields,
  });
  return target.client.confirm({ ticket: presigned.ticket }, options);
}

function toBytes(body: TestUploadInput["body"]): Uint8Array<ArrayBuffer> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  return new Uint8Array(body);
}
