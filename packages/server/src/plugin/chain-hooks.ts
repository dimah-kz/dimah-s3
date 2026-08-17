type Hook<Context> = (context: Context) => Promise<void> | void;

/**
 * Compose hooks into one that awaits each in order.
 *
 * Used by {@link dimahS3} when merging plugin + user hooks, and by consumers
 * to stack extras (quota, audit) beside plugin hooks:
 *
 * ```ts
 * upload: {
 *   guard: chainHooks(myQuotaGuard, myAuditGuard),
 * }
 * ```
 *
 * `undefined` entries are skipped, so optional hooks compose cleanly.
 */
export function chainHooks<Context>(
  ...hooks: (Hook<Context> | undefined)[]
): (context: Context) => Promise<void> {
  return async (context) => {
    for (const hook of hooks) {
      if (hook) await hook(context);
    }
  };
}
