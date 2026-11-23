"use client";

import type { ReactNode } from "react";
import {
  Toaster as StockToaster,
  toast as stockToast,
} from "@/components/ui/toast";

/** Props for {@link Toaster}. */
export type ToasterProps = {
  /**
   * Toasts shown at once. Older ones stay behind the newest until it
   * closes. @default 3
   */
  limit?: number;
  /**
   * Milliseconds before a toast closes on its own. `0` keeps toasts open
   * until they are closed. Progress toasts always stay open. @default 5000
   */
  timeout?: number;
  /** Optional. Toasts render in a portal, so the Toaster can wrap your app or sit beside it. */
  children?: ReactNode;
};

/**
 * Shows the toasts of `UploadToasts`, `DownloadToasts`, `DeleteToasts`,
 * the `ObjectList` built-in toasts, and your own {@link toast} calls.
 * Mount one per app.
 *
 * @example
 * ```tsx
 * import { Toaster } from "@dimah-s3/ui";
 *
 * <body>
 *   {children}
 *   <Toaster />
 * </body>
 * ```
 */
export function Toaster({ limit, timeout, children }: ToasterProps) {
  return (
    <StockToaster limit={limit} timeout={timeout}>
      {children}
    </StockToaster>
  );
}

/** The icon a toast shows. `loading` spins. */
export type ToastType = "success" | "error" | "warning" | "info" | "loading";

/** What one {@link toast} shows. */
export type ToastOptions = {
  title?: ReactNode;
  description?: ReactNode;
  type?: ToastType;
  /**
   * Milliseconds before it closes on its own. `0` keeps it open. Defaults
   * to the `Toaster`'s `timeout`.
   */
  timeout?: number;
  /** `high` announces it assertively, for errors. @default "low" */
  priority?: "low" | "high";
  /** One button in the toast, such as "Retry". */
  action?: { label: ReactNode; onClick: () => void };
  /** Runs once the toast closes, by timeout or by the user. */
  onClose?: () => void;
};

function toStockOptions({ action, ...options }: ToastOptions) {
  return {
    ...options,
    ...(action
      ? { actionProps: { children: action.label, onClick: action.onClick } }
      : {}),
  };
}

/**
 * Shows your own toasts in the {@link Toaster}, beside the dimah-s3 ones.
 *
 * @example
 * ```ts
 * import { toast } from "@dimah-s3/ui";
 *
 * const id = toast.add({ type: "error", title: formatError(error) });
 * toast.close(id);
 * ```
 */
export const toast = {
  /** Shows a toast and returns its id. */
  add(options: ToastOptions): string {
    return stockToast.add(toStockOptions(options));
  },
  /** Changes a toast that is still open. */
  update(id: string, options: ToastOptions): void {
    stockToast.update(id, toStockOptions(options));
  },
  /** Closes the toast `id`, or every toast. */
  close(id?: string): void {
    stockToast.close(id);
  },
};
