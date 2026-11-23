import { describe, expect, it } from "vitest";
import { TranslationProvider } from "@fuma-translate/react";
import { S3LocaleContext } from "@/s3-provider";
import { renderHook, renderHookWithI18n } from "@/test/render-hook";
import { useFormatSpeed } from "./use-format-speed";

describe("useFormatSpeed", () => {
  it("appends /s to a file size", () => {
    const formatSpeed = renderHookWithI18n(useFormatSpeed);
    expect(formatSpeed(512)).toBe("512 B/s");
    expect(formatSpeed(1.5 * 1024 * 1024)).toBe("1.5 MB/s");
  });

  it("follows the provider locale and translations", () => {
    const hook = renderHook(useFormatSpeed, {
      wrapper: ({ children }) => (
        <S3LocaleContext.Provider value="fa">
          <TranslationProvider
            translations={{
              "MB(file size unit)": "مگابایت",
              "{size}/s(transfer speed)": "{size} در ثانیه",
            }}
          >
            {children}
          </TranslationProvider>
        </S3LocaleContext.Provider>
      ),
    });
    expect(hook.current(1.5 * 1024 * 1024)).toBe("۱٫۵ مگابایت در ثانیه");
    hook.unmount();
  });
});
