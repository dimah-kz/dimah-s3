import { act } from "react";
import { createRoot } from "react-dom/client";
import { TranslationProvider } from "@fuma-translate/react";

/** Capture a hook return value under an empty English translation map. */
export function renderHookWithI18n<T>(useHook: () => T): T {
  let value!: T;
  const host = document.createElement("div");
  const root = createRoot(host);

  function Probe() {
    value = useHook();
    return null;
  }

  act(() => {
    root.render(
      <TranslationProvider translations={{}}>
        <Probe />
      </TranslationProvider>,
    );
  });
  act(() => {
    root.unmount();
  });

  return value;
}
