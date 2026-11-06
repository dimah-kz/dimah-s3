import type { UploadFileState, UploadLimit } from "@/types/upload";

/** One mounted component's limit, updated after each of its renders. */
export type UploadLimitRef = { current: UploadLimit | null };

/** The limits on one hook instance, and the slots its calls hold. */
type Intake = {
  limits: Set<UploadLimitRef>;
  /** Slots held by calls still preparing. */
  reserved: number;
  listeners: Set<() => void>;
};

/** Per `useUpload` instance, by `instanceId`. Shared by every root. */
const intakes = new Map<string, Intake>();

function intakeFor(instanceId: string): Intake {
  let intake = intakes.get(instanceId);
  if (!intake) {
    intake = { limits: new Set(), reserved: 0, listeners: new Set() };
    intakes.set(instanceId, intake);
  }
  return intake;
}

/** Drops the record once nothing limits, holds or watches the instance. */
function prune(instanceId: string, intake: Intake) {
  if (
    intake.limits.size === 0 &&
    intake.reserved === 0 &&
    intake.listeners.size === 0 &&
    intakes.get(instanceId) === intake
  ) {
    intakes.delete(instanceId);
  }
}

/** Limits every call of the instance at `ref.current` until the returned cleanup runs. */
export function addUploadLimit(
  instanceId: string,
  ref: UploadLimitRef,
): () => void {
  const intake = intakeFor(instanceId);
  intake.limits.add(ref);
  return () => {
    intake.limits.delete(ref);
    prune(instanceId, intake);
  };
}

/**
 * Holds `count` slots for a call that is still preparing, so a call that
 * starts meanwhile sees fewer. The returned function gives them back.
 */
export function reserveUploadSlots(
  instanceId: string,
  count: number,
): () => void {
  if (count <= 0) return () => {};
  const intake = intakeFor(instanceId);
  intake.reserved += count;
  notify(intake);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    intake.reserved -= count;
    notify(intake);
    prune(instanceId, intake);
  };
}

/** Slots held by the instance's calls still preparing. */
export function reservedUploadSlots(instanceId: string): number {
  return intakes.get(instanceId)?.reserved ?? 0;
}

/** Runs `listener` when the slots held by the instance's calls change. */
export function subscribeUploadSlots(
  instanceId: string,
  listener: () => void,
): () => void {
  const intake = intakeFor(instanceId);
  intake.listeners.add(listener);
  return () => {
    intake.listeners.delete(listener);
    prune(instanceId, intake);
  };
}

function notify(intake: Intake) {
  for (const listener of intake.listeners) listener();
}

/**
 * Files a new call of the instance may take: the strictest of its limits,
 * given its queue `files`. `Infinity` without a limit.
 */
export function freeUploadSlots(
  instanceId: string,
  files: readonly UploadFileState[],
): number {
  const intake = intakes.get(instanceId);
  let free = Number.POSITIVE_INFINITY;
  if (!intake) return free;
  for (const { current } of intake.limits) {
    if (current) {
      free = Math.min(free, uploadSlotsLeft(current, files, intake.reserved));
    }
  }
  return free;
}

/**
 * What `limit` leaves: `available` minus the `reserved` slots and every
 * file that is queued, in flight, or uploaded but not `counted`.
 */
export function uploadSlotsLeft(
  limit: UploadLimit,
  files: readonly UploadFileState[],
  reserved: number,
): number {
  let taken = reserved;
  for (const entry of files) {
    if (entry.phase === "error") continue;
    if (entry.phase === "success" && limit.counted?.has(entry.id)) continue;
    taken += 1;
  }
  return Math.max(0, limit.available - taken);
}
