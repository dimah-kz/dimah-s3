import type { TransferProgress } from "@/types/operation";

/**
 * Progress for `loaded` of `total` bytes, with a whole-number percent capped
 * at 100. A `total` of `0` is unknown, and its percent is `0`.
 */
export function transferProgress(
  loaded: number,
  total: number,
): TransferProgress {
  return {
    loaded,
    total,
    percent: total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0,
  };
}
