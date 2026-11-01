import { ConfigError } from "@/helpers/error-boundary";
import {
  decodeMetadataValue,
  encodeMetadataValue,
} from "@/helpers/metadata-encoding";

/** S3 user-metadata key for the upload marker. Its value is the upload token. */
export const UPLOAD_MARKER_META = "dimah-upload";

/** S3 user-metadata key for `upload.object().previousKey`. */
export const PREVIOUS_KEY_META = "dimah-previous-key";

/** S3 limit on user metadata: UTF-8 bytes of every key and value, summed. */
export const MAX_METADATA_BYTES = 2048;

const INTERNAL_KEYS: ReadonlySet<string> = new Set([
  UPLOAD_MARKER_META,
  PREVIOUS_KEY_META,
]);

/** An HTTP header-name token, so `x-amz-meta-{key}` is a valid header. */
const METADATA_KEY = /^[!#$%&'*+.^`|~\w-]+$/;

export type ObjectMetadataInput = {
  /** User metadata from `upload.object()` or `s3.put`. */
  metadata?: Record<string, string>;
  uploadToken: string;
  /** Key to delete after a successful confirm. */
  previousKey?: string;
};

/**
 * S3 user metadata for a new object: the user metadata plus the upload
 * marker and the previous key. Keys are lowercased, as S3 stores them, and
 * values are RFC 2047-encoded where needed.
 *
 * Throws a {@link ConfigError} when a key is invalid, repeats, or uses an
 * internal name, or when the total exceeds {@link MAX_METADATA_BYTES}.
 */
export function buildObjectMetadata(
  input: ObjectMetadataInput,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(input.metadata ?? {})) {
    const key = name.toLowerCase();
    if (!METADATA_KEY.test(key)) {
      throw new ConfigError(`S3 metadata key "${name}" is not a valid name.`);
    }
    if (INTERNAL_KEYS.has(key)) {
      throw new ConfigError(`S3 metadata key "${name}" is reserved.`);
    }
    if (Object.hasOwn(result, key)) {
      throw new ConfigError(`S3 metadata key "${name}" is set twice.`);
    }
    result[key] = encodeMetadataValue(value);
  }
  const userBytes = metadataByteSize(result);

  result[UPLOAD_MARKER_META] = input.uploadToken;
  if (input.previousKey !== undefined) {
    result[PREVIOUS_KEY_META] = encodeMetadataValue(input.previousKey);
  }
  const totalBytes = metadataByteSize(result);
  if (totalBytes > MAX_METADATA_BYTES) {
    throw new ConfigError(
      `S3 metadata is ${totalBytes} bytes (${userBytes} from upload.object() ` +
        `and ${totalBytes - userBytes} added by dimah-s3); S3 allows ` +
        `${MAX_METADATA_BYTES}. Keys and values count once encoded.`,
    );
  }
  return result;
}

/** User metadata as HeadObject returns it, split from the internal keys. */
export type StoredObjectMetadata = {
  /** Decoded user metadata, without internal keys. */
  metadata: Record<string, string>;
  uploadToken?: string;
  previousKey?: string;
};

/** Splits and decodes HeadObject `Metadata`. */
export function readObjectMetadata(
  raw: Record<string, string> | undefined,
): StoredObjectMetadata {
  const metadata: Record<string, string> = {};
  let uploadToken: string | undefined;
  let previousKey: string | undefined;
  for (const [name, value] of Object.entries(raw ?? {})) {
    const key = name.toLowerCase();
    const decoded = decodeMetadataValue(value);
    if (key === UPLOAD_MARKER_META) uploadToken = decoded;
    else if (key === PREVIOUS_KEY_META) previousKey = decoded || undefined;
    else metadata[key] = decoded;
  }
  return { metadata, uploadToken, previousKey };
}

/**
 * The upload token an object was written with: its upload marker, read
 * from HeadObject `Metadata`. `undefined` for an object dimah-s3 did not
 * write. A plugin that cleans up an upload deletes the object only while
 * this still equals the token of the upload it tracks.
 */
export function readUploadMarker(
  metadata: Record<string, string> | undefined,
): string | undefined {
  return readObjectMetadata(metadata).uploadToken;
}

function metadataByteSize(metadata: Record<string, string>): number {
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const [key, value] of Object.entries(metadata)) {
    bytes += encoder.encode(key).length + encoder.encode(value).length;
  }
  return bytes;
}
