import { vi } from "vitest";
import {
  s3Error,
  S3_DEFAULT_PART_SIZE,
  type ConfirmedObjectResponse,
  type S3Api,
  type UploadPayload,
} from "@dimah-s3/core";

const bucket = "bucket";

/** Overrides for {@link fakeS3Api}: any method, or any `multipart` method. */
export type FakeS3ApiOverrides = Omit<Partial<S3Api>, "multipart"> & {
  multipart?: Partial<S3Api["multipart"]>;
};

type FakeUpload = {
  key: string;
  name: string;
  size: number;
  type: string | undefined;
  metadata: Record<string, string>;
  uploadId: string | null;
  partSize: number;
  partCount: number;
};

/**
 * Typed `S3Api` stub. Override individual methods (or `multipart.*`) per test.
 * Every default is a `vi.fn` that succeeds with stable fixture values: keys
 * are `${route}/${name}`, tickets are `ticket-1`, `ticket-2`, … and upload IDs
 * `upload-1`, … . Confirm and the multipart calls look the ticket up, so they
 * return the uploaded file's key, size and metadata, and an unknown ticket
 * fails with `UPLOAD_TICKET_INVALID`. Multipart uses 8 MiB parts.
 */
export function fakeS3Api(overrides: FakeS3ApiOverrides = {}): S3Api {
  const { multipart, ...rest } = overrides;
  const uploads = new Map<string, FakeUpload>();
  let nextTicket = 0;
  let nextUploadId = 0;

  function issueTicket(
    payload: Omit<UploadPayload, "checksum">,
    uploadId: string | null,
  ) {
    const ticket = `ticket-${++nextTicket}`;
    const partSize = S3_DEFAULT_PART_SIZE;
    const upload: FakeUpload = {
      key: `${payload.route}/${payload.name}`,
      name: payload.name,
      size: payload.size,
      type: payload.type,
      metadata: payload.metadata ?? {},
      uploadId,
      partSize,
      partCount: Math.max(1, Math.ceil(payload.size / partSize)),
    };
    uploads.set(ticket, upload);
    return { ticket, upload };
  }

  function readTicket(ticket: string) {
    const upload = uploads.get(ticket);
    if (!upload) throw s3Error("UPLOAD_TICKET_INVALID");
    return upload;
  }

  function readMultipart(ticket: string) {
    const upload = readTicket(ticket);
    if (upload.uploadId === null) throw s3Error("UPLOAD_TICKET_INVALID");
    return { ...upload, uploadId: upload.uploadId };
  }

  function confirmed(upload: FakeUpload): ConfirmedObjectResponse {
    return {
      key: upload.key,
      bucket,
      name: upload.name,
      size: upload.size,
      ...(upload.type ? { type: upload.type } : {}),
      eTag: '"etag"',
      metadata: upload.metadata,
    };
  }

  return {
    upload: vi.fn(async (payload) => {
      const { ticket, upload } = issueTicket(payload, null);
      const { key } = upload;
      return {
        key,
        bucket,
        url: "https://s3.test/post",
        expiresIn: 600,
        ticket,
        method: "POST" as const,
        fields: { key, Policy: "p" },
      };
    }),
    confirm: vi.fn(async ({ ticket }) => confirmed(readTicket(ticket))),
    download: vi.fn(async (payload) => ({
      key: payload.key,
      bucket,
      url: `https://s3.test/dl/${payload.key}`,
      mode: "presign" as const,
      disposition: payload.disposition ?? "attachment",
      expiresIn: payload.expiresIn ?? 600,
    })),
    delete: vi.fn(async (payload) => ({ key: payload.key, bucket })),
    deleteMany: vi.fn(async (payload) => ({
      deleted: [...payload.keys],
      failed: [],
    })),
    catalog: vi.fn(async () => ({
      routes: {
        uploads: {
          upload: {
            enabled: true as const,
            multipart: false,
            checksum: false,
          },
          download: {
            enabled: true as const,
            maxExpiresIn: 3600,
            disposition: "attachment" as const,
            inlineTypes: [],
            mode: "presign" as const,
          },
          delete: { enabled: true },
        },
      },
    })),
    multipart: {
      init: vi.fn(async (payload) => {
        const uploadId = `upload-${++nextUploadId}`;
        const { ticket, upload } = issueTicket(payload, uploadId);
        return {
          key: upload.key,
          bucket,
          uploadId,
          ticket,
          partSize: upload.partSize,
          partCount: upload.partCount,
          checksum: false,
        };
      }),
      signPart: vi.fn(async ({ ticket, partNumber }) => {
        const { size, partSize, partCount } = readMultipart(ticket);
        if (partNumber < 1 || partNumber > partCount) {
          throw s3Error("MULTIPART_PART_INVALID", { partNumber, partCount });
        }
        return {
          url: `https://s3.test/part/${partNumber}`,
          partNumber,
          size:
            partNumber < partCount
              ? partSize
              : size - partSize * (partCount - 1),
          expiresIn: 600,
          headers: {},
        };
      }),
      listParts: vi.fn(async ({ ticket }) => {
        readMultipart(ticket);
        return { parts: [] };
      }),
      complete: vi.fn(async ({ ticket }) => {
        const upload = readMultipart(ticket);
        return { ...confirmed(upload), uploadId: upload.uploadId };
      }),
      abort: vi.fn(async ({ ticket }) => {
        const { key, uploadId } = readMultipart(ticket);
        return { key, bucket: "bucket", uploadId };
      }),
      ...multipart,
    },
    ...rest,
  };
}
