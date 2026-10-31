/** One unit of work for one key. The store assigns `id`. */
export type KeyedOperation = { id: string; key: string };

/** The fields a call sets on its operation. The store owns `id` and `key`. */
export type OperationFields<TOp extends KeyedOperation> = Omit<
  TOp,
  "id" | "key"
>;

/** Immutable store state. A change replaces the whole snapshot. */
export type OperationSnapshot<TOp extends KeyedOperation> = {
  /** Operations in creation order, so `id`s ascend. */
  operations: readonly TOp[];
  /** Keys with a running call, in start order. */
  pendingKeys: readonly string[];
};

/**
 * Runs after a call settled and its key is free, before joined callers get
 * the outcome. For after-callbacks such as `onSuccess` and `onSettled`.
 * A throw or rejection rejects every caller, so run consumer callbacks
 * through `runAfterCallback`.
 */
export type OperationAfter<TOutcome> = (outcome: TOutcome) => Promise<void>;

/**
 * A running call for one key, from {@link OperationStore.claim}. Other calls
 * for the key join it until its outcome is known.
 */
export type OperationClaim<TOp extends KeyedOperation, TOutcome> = {
  readonly key: string;
  /** Aborted by `cancel(key)` or `cancel()` on the store. */
  readonly signal: AbortSignal;
  /** Settles with the call's outcome. Joined calls get this same promise. */
  readonly promise: Promise<TOutcome>;
  /** The operation this call published, if any. */
  readonly operation: TOp | undefined;
  /** Publishes this call's operation. A call publishes at most once. */
  publish: (fields: OperationFields<TOp>) => TOp;
  /** Patches the published operation. Does nothing before `publish`. */
  update: (patch: Partial<OperationFields<TOp>>) => void;
  /**
   * Ends the call with `outcome` (or a promise of it). The key is freed as
   * soon as the outcome is known, then `after` runs, then `promise`
   * settles. So `after` can start a new call for the same key. Later calls
   * do nothing.
   */
  settle: (
    outcome: TOutcome | PromiseLike<TOutcome>,
    after?: OperationAfter<TOutcome>,
  ) => Promise<TOutcome>;
};

/** Per-key operations with same-key joins. Create one per hook instance. */
export type OperationStore<TOp extends KeyedOperation, TOutcome> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => OperationSnapshot<TOp>;
  /** The newest operation for `key`. */
  get: (key: string) => TOp | undefined;
  /** The running call's promise for `key`, to join it. */
  join: (key: string) => Promise<TOutcome> | undefined;
  /** Starts a call for a free `key`. Throws when the key is running. */
  claim: (key: string) => OperationClaim<TOp, TOutcome>;
  /**
   * Joins the running call for `key`, or claims the key and settles it with
   * `task` and `after` (see {@link OperationClaim.settle}). A throw or
   * rejection from `task` rejects every joined caller.
   */
  run: (
    key: string,
    task: (claim: OperationClaim<TOp, TOutcome>) => Promise<TOutcome>,
    after?: OperationAfter<TOutcome>,
  ) => Promise<TOutcome>;
  /**
   * Aborts the running call for `key`, or every running call. Without a
   * `reason` the signal aborts with an `AbortError` `DOMException`.
   */
  cancel: (key?: string, reason?: unknown) => void;
  /** Removes settled operations for `key`, or all settled operations. */
  reset: (key?: string) => void;
};

/** The newest operation for `key` in creation-ordered `operations`. */
export function newestOperation<TOp extends KeyedOperation>(
  operations: readonly TOp[],
  key: string,
): TOp | undefined {
  return operations.findLast((operation) => operation.key === key);
}

/** Runs `after`, then resolves with `outcome`. A synchronous throw rejects. */
async function runAfter<TOutcome>(
  after: OperationAfter<TOutcome>,
  outcome: TOutcome,
): Promise<TOutcome> {
  await after(outcome);
  return outcome;
}

/** Creates an empty {@link OperationStore}. */
export function createOperationStore<
  TOp extends KeyedOperation,
  TOutcome,
>(): OperationStore<TOp, TOutcome> {
  type Running = {
    controller: AbortController;
    promise: Promise<TOutcome>;
    operationId: string | null;
  };

  const running = new Map<string, Running>();
  const listeners = new Set<() => void>();
  let nextId = 0;
  let snapshot: OperationSnapshot<TOp> = { operations: [], pendingKeys: [] };

  function commit(operations: readonly TOp[]) {
    snapshot = { operations, pendingKeys: [...running.keys()] };
    for (const listener of listeners) listener();
  }

  function isRunning(operation: TOp) {
    return running.get(operation.key)?.operationId === operation.id;
  }

  function claim(key: string): OperationClaim<TOp, TOutcome> {
    if (running.has(key)) {
      throw new Error(`[dimah-s3] Key "${key}" already has a running call.`);
    }

    const { promise, resolve, reject } = Promise.withResolvers<TOutcome>();
    const entry: Running = {
      controller: new AbortController(),
      promise,
      operationId: null,
    };
    let settled = false;
    running.set(key, entry);
    commit(snapshot.operations);

    const release = () => {
      running.delete(key);
      commit(snapshot.operations);
    };

    return {
      key,
      signal: entry.controller.signal,
      promise,
      get operation() {
        return entry.operationId === null
          ? undefined
          : snapshot.operations.find(({ id }) => id === entry.operationId);
      },
      publish(fields) {
        if (entry.operationId !== null) {
          throw new Error(
            `[dimah-s3] The call for "${key}" already published an operation.`,
          );
        }
        const operation = { ...fields, id: String(++nextId), key } as TOp;
        entry.operationId = operation.id;
        commit([...snapshot.operations, operation]);
        return operation;
      },
      update(patch) {
        const id = entry.operationId;
        if (id === null) return;
        commit(
          snapshot.operations.map((operation) =>
            operation.id === id ? { ...operation, ...patch } : operation,
          ),
        );
      },
      settle(outcome, after) {
        if (settled) return promise;
        settled = true;
        Promise.resolve(outcome).then(
          (value) => {
            release();
            resolve(after ? runAfter(after, value) : value);
          },
          (error: unknown) => {
            release();
            reject(error);
          },
        );
        return promise;
      },
    };
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    get: (key) => newestOperation(snapshot.operations, key),
    join: (key) => running.get(key)?.promise,
    claim,
    run(key, task, after) {
      const joined = running.get(key)?.promise;
      if (joined) return joined;
      const call = claim(key);
      // An async wrapper turns a synchronous throw into a rejection.
      const start = async () => task(call);
      return call.settle(start(), after);
    },
    cancel(key, reason) {
      const entries =
        key === undefined ? [...running.values()] : [running.get(key)];
      for (const entry of entries) entry?.controller.abort(reason);
    },
    reset(key) {
      const operations = snapshot.operations.filter(
        (operation) =>
          isRunning(operation) || (key !== undefined && operation.key !== key),
      );
      if (operations.length !== snapshot.operations.length) commit(operations);
    },
  };
}
