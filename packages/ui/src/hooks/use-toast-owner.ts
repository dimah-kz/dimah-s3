"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Bundlers replace this; declared here so the ui types need no Node typings.
declare const process: { env: { NODE_ENV?: string } };

/** `token` identifies one mounted component, also across StrictMode replays. */
type ToastOwner = { token: object; weak: boolean };

/** Mounted owners per hook instance, in mount order. Shared by every root. */
const owners = new Map<string, readonly ToastOwner[]>();
/** Extra strong owners already warned about, so each warns once. */
const warned = new WeakSet<object>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function register(instanceId: string, owner: ToastOwner) {
  const current = owners.get(instanceId) ?? [];
  if (
    !owner.weak &&
    current.some((other) => !other.weak) &&
    !warned.has(owner.token) &&
    process.env.NODE_ENV !== "production"
  ) {
    warned.add(owner.token);
    console.warn(
      "[dimah-s3] More than one toast owner is mounted for the same hook. " +
        "Only the first one shows toasts. Mount UploadToasts, DownloadToasts " +
        "or DeleteToasts once per hook.",
    );
  }
  owners.set(instanceId, [...current, owner]);
  notify();

  return () => {
    const rest = (owners.get(instanceId) ?? []).filter(
      (other) => other !== owner,
    );
    if (rest.length > 0) owners.set(instanceId, rest);
    else owners.delete(instanceId);
    notify();
  };
}

/** The first strong owner, or the first weak one when no strong owner is mounted. */
function activeToken(instanceId: string) {
  const current = owners.get(instanceId);
  return (current?.find((owner) => !owner.weak) ?? current?.[0])?.token;
}

/**
 * Registers a toast owner for a hook instance (`instanceId` from the hook)
 * and returns whether this owner is the active one. Only the active owner
 * shows toasts and live messages, so they are never duplicated.
 *
 * - Strong (default): the first mounted strong owner is active. Extra strong
 *   owners render nothing and warn in development.
 * - Weak (ObjectList built-ins): active only while no strong owner is
 *   mounted for the same hook.
 *
 * Returns `false` on the server and until the owner has mounted.
 */
export function useToastOwner(
  instanceId: string,
  options: { weak?: boolean } = {},
): boolean {
  const weak = options.weak ?? false;
  const [token] = useState<object>(() => ({}));

  useEffect(
    () => register(instanceId, { token, weak }),
    [instanceId, token, weak],
  );

  return useSyncExternalStore(
    subscribe,
    () => activeToken(instanceId) === token,
    () => false,
  );
}
