export type DeletePhase =
  "idle" | "confirming" | "deleting" | "success" | "error";

/** Lifecycle hooks for delete. */
export type DeleteHooks = {
  /** Runs before delete. Return `false` to block it. */
  beforeDelete?: (key: string) => Promise<boolean> | boolean;
  /** Fires when delete begins (after confirmation). */
  onDeleteStart?: (key: string) => void;
  onSuccess?: (key: string) => Promise<void> | void;
  onError?: (key: string, error: unknown, phase: DeletePhase) => void;
};
