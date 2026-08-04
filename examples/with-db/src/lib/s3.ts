import { dimahS3 } from "@dimah-s3/server";
import { db, forbidden } from "@dimah-s3/db";
import { dimahS3Db } from "@/lib/db";
import { defaultBucket, s3Client } from "@/lib/s3-client";
import { resolveScope } from "@/lib/storage/scope";

const MAX_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB per scope

/** Quota after db ownership — counts pending `declaredSize` too. */
async function quotaGuard(context: {
  request: Request;
  fileSize?: number;
}): Promise<void> {
  const scope = resolveScope(context.request);
  const { totalBytes } = await s3.db.objects.getScopeUsage(scope);
  if (totalBytes + (context.fileSize ?? 0) > MAX_TOTAL_BYTES) {
    throw forbidden("Storage quota exceeded");
  }
}

/**
 * db plugin wires lifecycle hooks; user guards (quota) merge after.
 * Use `s3.db.objects` for listings / quota / custom routes.
 */
export const s3 = dimahS3({
  s3: s3Client,
  defaultBucket,
  resolveObjectAcl: true,

  plugins: [
    db({
      client: dimahS3Db,
      resolveScope,
    }),
  ],

  upload: {
    method: "POST",
    enabled: true,
    presignGuard: quotaGuard,
  },

  multipart: {
    enabled: true,
    initGuard: quotaGuard,
  },

  download: { enabled: true },
  delete: { enabled: true },
});
