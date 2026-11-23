import { describe, expect, it } from "vitest";
import { TranslationProvider } from "@fuma-translate/react";
import { S3LocaleContext } from "@/s3-provider";
import { renderHook, renderHookWithI18n } from "@/test/render-hook";
import { useFormatEta } from "./use-format-eta";

const progress = (remaining: number, speed?: number) => ({
  loaded: 1000,
  total: 1000 + remaining,
  speed,
});

describe("useFormatEta", () => {
  it("returns null until the speed is known or when nothing is left", () => {
    const formatEta = renderHookWithI18n(useFormatEta);
    expect(formatEta(progress(1000))).toBeNull();
    expect(formatEta(progress(1000, 0))).toBeNull();
    expect(formatEta(progress(0, 100))).toBeNull();
  });

  it("formats seconds, minutes, and hours", () => {
    const formatEta = renderHookWithI18n(useFormatEta);
    expect(formatEta(progress(100, 100))).toBe("1s left");
    expect(formatEta(progress(4_400_000, 450_000))).toBe("10s left");
    expect(formatEta(progress(90_000_000, 1_500_000))).toBe("1m left");
    expect(formatEta(progress(5_400_000_000, 500_000))).toBe("3h left");
    expect(formatEta(progress(5_400, 1))).toBe("1h 30m left");
  });

  it("rounds up across unit boundaries", () => {
    const formatEta = renderHookWithI18n(useFormatEta);
    expect(formatEta(progress(595, 10))).toBe("1m left");
    expect(formatEta(progress(3_590, 1))).toBe("1h left");
  });

  it("follows the provider locale and translations", () => {
    const hook = renderHook(useFormatEta, {
      wrapper: ({ children }) => (
        <S3LocaleContext.Provider value="fa">
          <TranslationProvider
            translations={{
              "{minutes}m left(time remaining)": "{minutes} دقیقه مانده",
            }}
          >
            {children}
          </TranslationProvider>
        </S3LocaleContext.Provider>
      ),
    });
    expect(hook.current(progress(720, 1))).toBe("۱۲ دقیقه مانده");
    hook.unmount();
  });
});
