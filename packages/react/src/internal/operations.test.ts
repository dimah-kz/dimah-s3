import { describe, expect, it, vi } from "vitest";
import { createOperationStore } from "./operations";

type Op = { id: string; key: string; phase: "running" | "done" };
type Outcome = { status: "success"; key: string };

function setup() {
  return createOperationStore<Op, Outcome>();
}

function success(key: string): Outcome {
  return { status: "success", key };
}

describe("createOperationStore", () => {
  it("joins a same-key call with the identical promise and runs the task once", async () => {
    const store = setup();
    const task = vi.fn(async () => success("a"));

    const first = store.run("a", task);
    const second = store.run("a", task);

    expect(second).toBe(first);
    expect(store.join("a")).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toEqual(success("a"));
  });

  it("runs other keys in parallel", () => {
    const store = setup();
    const task = vi.fn(() => new Promise<Outcome>(() => {}));

    void store.run("a", task);
    void store.run("b", task);

    expect(task).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().pendingKeys).toEqual(["a", "b"]);
  });

  it("frees the key before the outcome reaches callers", async () => {
    const store = setup();
    const claim = store.claim("a");

    expect(store.getSnapshot().pendingKeys).toEqual(["a"]);
    const pending = claim.promise.then(() => store.getSnapshot().pendingKeys);
    void claim.settle(success("a"));

    await expect(pending).resolves.toEqual([]);
    expect(store.join("a")).toBeUndefined();
  });

  it("frees the key before after runs, and callers wait for after", async () => {
    const store = setup();
    const steps: string[] = [];
    let retried: Promise<Outcome> | undefined;

    const first = store.run(
      "a",
      async () => success("a"),
      async () => {
        steps.push(`after: ${store.getSnapshot().pendingKeys.join(",")}`);
        retried = store.run("a", async () => {
          steps.push("second task");
          return success("a");
        });
        await retried;
      },
    );
    const joined = store.run("a", async () => success("a"));

    expect(joined).toBe(first);
    await first;
    steps.push("first settled");

    expect(retried).not.toBe(first);
    expect(steps).toEqual(["after: ", "second task", "first settled"]);
    expect(store.getSnapshot().pendingKeys).toEqual([]);
  });

  it("does not run after when the task fails", async () => {
    const store = setup();
    const after = vi.fn(async () => {});
    const error = new Error("boom");

    await expect(
      store.run(
        "a",
        async () => {
          throw error;
        },
        after,
      ),
    ).rejects.toBe(error);
    expect(after).not.toHaveBeenCalled();
  });

  it("rejects every caller when after throws synchronously", async () => {
    const store = setup();
    const error = new Error("after");
    const after = (): Promise<void> => {
      throw error;
    };

    const first = store.run("a", async () => success("a"), after);
    const joined = store.run("a", async () => success("a"));

    await expect(first).rejects.toBe(error);
    await expect(joined).rejects.toBe(error);
    expect(store.join("a")).toBeUndefined();
  });

  it("starts a new call once the previous one settled", async () => {
    const store = setup();
    const first = store.run("a", async () => success("a"));
    await first;

    const second = store.run("a", async () => success("a"));
    expect(second).not.toBe(first);
    await second;
  });

  it("returns the newest operation for a key from get", async () => {
    const store = setup();
    await store.run("a", async (claim) => {
      claim.publish({ phase: "done" });
      return success("a");
    });
    await store.run("b", async (claim) => {
      claim.publish({ phase: "done" });
      return success("b");
    });
    const claim = store.claim("a");
    const newest = claim.publish({ phase: "running" });

    expect(store.get("a")).toBe(newest);
    expect(store.getSnapshot().operations.map((op) => op.key)).toEqual([
      "a",
      "b",
      "a",
    ]);
    expect(store.get("missing")).toBeUndefined();
  });

  it("gives operations ascending ids in creation order", () => {
    const store = setup();
    const a = store.claim("a").publish({ phase: "running" });
    const b = store.claim("b").publish({ phase: "running" });

    expect(Number(b.id)).toBeGreaterThan(Number(a.id));
    expect(store.getSnapshot().operations).toEqual([a, b]);
  });

  it("patches the published operation with a new object", () => {
    const store = setup();
    const claim = store.claim("a");
    claim.update({ phase: "done" });
    expect(store.getSnapshot().operations).toEqual([]);

    const published = claim.publish({ phase: "running" });
    claim.update({ phase: "done" });

    expect(claim.operation).toEqual({ ...published, phase: "done" });
    expect(claim.operation).not.toBe(published);
    expect(() => claim.publish({ phase: "running" })).toThrow(
      /already published/,
    );
  });

  it("replaces the snapshot and notifies listeners on each change", () => {
    const store = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getSnapshot();

    const claim = store.claim("a");
    claim.publish({ phase: "running" });

    expect(store.getSnapshot()).not.toBe(before);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    claim.update({ phase: "done" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("throws when claiming a running key", () => {
    const store = setup();
    store.claim("a");
    expect(() => store.claim("a")).toThrow(/already has a running call/);
  });

  it("rejects joined callers and frees the key when the task fails", async () => {
    const store = setup();
    const error = new Error("boom");
    const first = store.run("a", async () => {
      throw error;
    });
    const joined = store.run("a", async () => success("a"));

    await expect(first).rejects.toBe(error);
    await expect(joined).rejects.toBe(error);
    expect(store.getSnapshot().pendingKeys).toEqual([]);
  });

  it("settles with a synchronous throw from the task", async () => {
    const store = setup();
    const error = new Error("sync");

    const result = store.run("a", () => {
      throw error;
    });

    await expect(result).rejects.toBe(error);
    expect(store.join("a")).toBeUndefined();
  });

  it("ignores a second settle", async () => {
    const store = setup();
    const claim = store.claim("a");
    void claim.settle(success("a"));
    void claim.settle({ status: "success", key: "other" });

    await expect(claim.promise).resolves.toEqual(success("a"));
  });

  it("cancels one key with an AbortError, or every running key", () => {
    const store = setup();
    const a = store.claim("a");
    const b = store.claim("b");
    const c = store.claim("c");

    store.cancel("a");
    expect(a.signal.aborted).toBe(true);
    expect(a.signal.reason).toMatchObject({ name: "AbortError" });
    expect(b.signal.aborted).toBe(false);

    const reason = new DOMException("detach", "AbortError");
    store.cancel(undefined, reason);
    expect(b.signal.reason).toBe(reason);
    expect(c.signal.reason).toBe(reason);
    store.cancel("missing");
  });

  it("does not abort a settled call", async () => {
    const store = setup();
    const claim = store.claim("a");
    await claim.settle(success("a"));

    store.cancel("a");
    expect(claim.signal.aborted).toBe(false);
  });

  it("resets settled operations only, for one key or all", async () => {
    const store = setup();
    const settle = async (key: string) =>
      store.run(key, async (claim) => {
        claim.publish({ phase: "done" });
        return success(key);
      });
    await settle("a");
    await settle("b");
    const running = store.claim("a");
    const live = running.publish({ phase: "running" });

    store.reset("a");
    expect(store.getSnapshot().operations.map((op) => op.key)).toEqual([
      "b",
      "a",
    ]);

    store.reset();
    expect(store.getSnapshot().operations).toEqual([live]);

    const listener = vi.fn();
    store.subscribe(listener);
    store.reset();
    expect(listener).not.toHaveBeenCalled();
  });
});
