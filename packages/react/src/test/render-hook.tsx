import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TranslationProvider } from "@fuma-translate/react";

export type RenderedHook<T> = {
  readonly current: T;
  rerender: () => void;
  unmount: () => void;
};

/**
 * Mount a hook under an empty English translation map.
 * Call `unmount()` when the test finishes (stateful hooks keep the tree alive).
 */
export function renderHook<T>(
  useHook: () => T,
  options?: {
    wrapper?: (props: { children: ReactNode }) => ReactNode;
  },
): RenderedHook<T> {
  let latest!: T;
  const host = document.createElement("div");
  const root: Root = createRoot(host);
  const wrap = options?.wrapper;

  function Probe() {
    latest = useHook();
    return null;
  }

  const tree = () => {
    const inner = <Probe />;
    return (
      <TranslationProvider translations={{}}>
        {wrap ? wrap({ children: inner }) : inner}
      </TranslationProvider>
    );
  };

  act(() => {
    root.render(tree());
  });

  return {
    get current() {
      return latest;
    },
    rerender() {
      act(() => {
        root.render(tree());
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

/** One-shot render for hooks that return a stable callback (formatters). */
export function renderHookWithI18n<T>(useHook: () => T): T {
  const rendered = renderHook(useHook);
  const value = rendered.current;
  rendered.unmount();
  return value;
}
