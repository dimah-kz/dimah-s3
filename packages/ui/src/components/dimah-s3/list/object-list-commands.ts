"use client";

import { useState } from "react";

/**
 * Opens list UI that lives inside `ObjectList` from a shortcut or menu
 * outside it. Create it with {@link useObjectListCommands} and pass it to
 * `ObjectList` as `commands`. Calls before the list mounts do nothing.
 */
export type ObjectListCommands = {
  /**
   * Opens the New folder name field. Does nothing when the source has no
   * `createFolder`.
   */
  startNewFolder: () => void;
  /**
   * Opens the actions menu of the entry with this key. Does nothing when
   * that entry is not on screen.
   */
  openMenu: (entryKey: string) => void;
};

type CommandHost = {
  startNewFolder: () => void;
  openMenu: (entryKey: string) => void;
};

const hosts = new WeakMap<
  ObjectListCommands,
  { current: CommandHost | null }
>();

/**
 * A stable {@link ObjectListCommands}. The same object keeps working for
 * the life of the component that called this.
 */
function createCommands(): ObjectListCommands {
  const host: { current: CommandHost | null } = { current: null };
  const commands: ObjectListCommands = {
    startNewFolder: () => host.current?.startNewFolder(),
    openMenu: (entryKey) => host.current?.openMenu(entryKey),
  };
  hosts.set(commands, host);
  return commands;
}

export function useObjectListCommands(): ObjectListCommands {
  const [commands] = useState(createCommands);
  return commands;
}

/** Points `commands` at the mounted list. `null` detaches it. @internal */
export function bindObjectListCommands(
  commands: ObjectListCommands,
  host: CommandHost | null,
): void {
  const slot = hosts.get(commands);
  if (slot) slot.current = host;
}
