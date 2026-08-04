import type {
  StorageObject,
  StorageObjectStatus,
} from "../types/storage-object";

/** Raw `storage_object` row as returned by the FumaDB ORM. */
export type StorageObjectRow = {
  id: string;
  scope: string;
  bucket: string;
  key: string;
  contentType: string | null;
  size: bigint | null;
  eTag: string | null;
  filename: string | null;
  status: string;
  metadata: unknown;
  acl: string | null;
  uploadId: string | null;
  declaredSize: bigint | null;
  confirmedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

function toNumber(value: bigint | number | null): number | null {
  if (value === null) return null;
  return typeof value === "bigint" ? Number(value) : value;
}

/** Normalize a raw row: bigint → number, status narrowing, metadata cast. */
export function mapStorageObjectRow(row: StorageObjectRow): StorageObject {
  return {
    id: row.id,
    scope: row.scope,
    bucket: row.bucket,
    key: row.key,
    contentType: row.contentType,
    size: toNumber(row.size),
    eTag: row.eTag,
    filename: row.filename,
    status: row.status as StorageObjectStatus,
    metadata: (row.metadata ?? null) as Record<string, unknown> | null,
    acl: row.acl,
    uploadId: row.uploadId,
    declaredSize: toNumber(row.declaredSize),
    confirmedAt: row.confirmedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
