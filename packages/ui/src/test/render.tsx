import type { JSXElementConstructor, ReactElement, ReactNode } from "react";
import { afterEach } from "vitest";
import { TranslationProvider } from "@fuma-translate/react";
import {
  cleanup,
  render as renderElement,
  renderHook as renderHookElement,
  type RenderHookOptions,
  type RenderHookResult,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";

export * from "@testing-library/react";

// Vitest runs without globals, so Testing Library cannot register this itself.
afterEach(cleanup);

type Wrapper = JSXElementConstructor<{ children: ReactNode }>;

/** Wraps `Inner` (when given) in the providers every ui component needs. */
function withProviders(Inner: Wrapper | undefined): Wrapper {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <TranslationProvider translations={{}}>
        {Inner ? <Inner>{children}</Inner> : children}
      </TranslationProvider>
    );
  };
}

/**
 * Testing Library `render` under an empty English translation map.
 * A `wrapper` renders inside the providers. Trees unmount after each test.
 */
export function render(
  ui: ReactElement,
  options: Omit<RenderOptions, "queries"> = {},
): RenderResult {
  return renderElement(ui, {
    ...options,
    wrapper: withProviders(options.wrapper),
  });
}

/** Testing Library `renderHook` with the same providers as {@link render}. */
export function renderHook<TResult, TProps>(
  hook: (props: TProps) => TResult,
  options: Omit<RenderHookOptions<TProps>, "queries"> = {},
): RenderHookResult<TResult, TProps> {
  return renderHookElement(hook, {
    ...options,
    wrapper: withProviders(options.wrapper),
  });
}
