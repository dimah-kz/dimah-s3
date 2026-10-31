import type { TransferProgress } from "@/types/operation";

/** Progress for `loaded` of `total` bytes, with a whole-number percent. */
export function transferProgress(
  loaded: number,
  total: number,
): TransferProgress {
  return {
    loaded,
    total,
    percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
  };
}
