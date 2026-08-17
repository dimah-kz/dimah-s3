/** Stable API error codes returned in JSON `{ code, message, params? }`. */
export const S3_ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  INVALID_JSON: "INVALID_JSON",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  OBJECT_NOT_FOUND: "OBJECT_NOT_FOUND",
  S3_NETWORK_ERROR: "S3_NETWORK_ERROR",
  FIELD_REQUIRED: "FIELD_REQUIRED",
  KEY_REQUIRED: "KEY_REQUIRED",
  UPLOAD_ID_REQUIRED: "UPLOAD_ID_REQUIRED",
  PART_NUMBER_INVALID: "PART_NUMBER_INVALID",
  PARTS_REQUIRED: "PARTS_REQUIRED",
  FILE_SIZE_REQUIRED_UPLOAD: "FILE_SIZE_REQUIRED_UPLOAD",
  FILE_SIZE_REQUIRED_MULTIPART: "FILE_SIZE_REQUIRED_MULTIPART",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type S3ErrorCode = (typeof S3_ERROR_CODES)[keyof typeof S3_ERROR_CODES];

export type DimahS3ErrorParams = Record<string, string | number>;

export type DimahS3ErrorOptions = {
  cause?: unknown;
  code?: S3ErrorCode | string;
  params?: DimahS3ErrorParams;
};

/** Typed API / procedure error with HTTP status and optional stable code. */
export class DimahS3Error extends Error {
  readonly status: number;
  readonly code?: S3ErrorCode | string;
  readonly params?: DimahS3ErrorParams;

  constructor(message: string, status = 400, options?: DimahS3ErrorOptions) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "DimahS3Error";
    this.status = status;
    this.code = options?.code;
    this.params = options?.params;
  }
}
