import type {
  StorageObject,
  StorageObjectStatus,
} from "@/types/storage-object";

/** Raw `storage_object` row as the FumaDB ORM returns it. */
export type StorageObjectRow = {
  id: string;
  scope: string;
  bucket: string;
  key: string;
  route: string;
  folderId: string | null;
  filename: string;
  contentType: string | null;
  size: bigint | null;
  declaredSize: bigint | null;
  eTag: string | null;
  status: string;
  s3Metadata: unknown;
  attributes: unknown;
  acl: string | null;
  uploadId: string | null;
  uploadToken: string | null;
  expiresAt: Date | null;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

/** Sizes are `bigint` columns. Every S3 object size fits a number. */
function toNumber(value: bigint | null): number | null {
  return value === null ? null : Number(value);
}

/** Normalizes a raw row: sizes become numbers, JSON columns are cast. */
export function mapStorageObjectRow<TAttributes = never>(
  row: StorageObjectRow,
): StorageObject<TAttributes> {
  return {
    id: row.id,
    scope: row.scope,
    bucket: row.bucket,
    key: row.key,
    route: row.route,
    folderId: row.folderId,
    filename: row.filename,
    contentType: row.contentType,
    size: toNumber(row.size),
    declaredSize: toNumber(row.declaredSize),
    eTag: row.eTag,
    status: row.status as StorageObjectStatus,
    s3Metadata: (row.s3Metadata ?? null) as Record<string, string> | null,
    attributes: (row.attributes ?? null) as TAttributes | null,
    acl: row.acl,
    uploadId: row.uploadId,
    uploadToken: row.uploadToken,
    expiresAt: row.expiresAt,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}
