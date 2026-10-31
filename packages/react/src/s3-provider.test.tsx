import { describe, expect, it } from "vitest";
import { TranslationProvider, useTranslations } from "@fuma-translate/react";
import { fakeS3Api } from "@/test/api";
import { renderHook } from "@/test/render-hook";
import { useFormatNumber } from "@/helpers/format-number";
import { S3Provider, useApi } from "./s3-provider";

function useProbe() {
  const t = useTranslations();
  return {
    api: useApi(),
    text: t("Upload failed", { note: "toast" }),
    number: useFormatNumber()(12),
  };
}

describe("S3Provider", () => {
  it("provides the api and the locale", () => {
    const api = fakeS3Api();
    const hook = renderHook(useProbe, {
      wrapper: ({ children }) => (
        <S3Provider api={api} locale="fa">
          {children}
        </S3Provider>
      ),
    });
    expect(hook.current.api).toBe(api);
    expect(hook.current.text).toBe("Upload failed");
    expect(hook.current.number).toBe("۱۲");
    hook.unmount();
  });

  it("applies its translations over a parent TranslationProvider", () => {
    const hook = renderHook(useProbe, {
      wrapper: ({ children }) => (
        <TranslationProvider
          translations={{ "Upload failed(toast)": "Parent" }}
        >
          <S3Provider
            api={fakeS3Api()}
            translations={{
              "Upload failed(toast)": "Hochladen fehlgeschlagen",
            }}
          >
            {children}
          </S3Provider>
        </TranslationProvider>
      ),
    });
    expect(hook.current.text).toBe("Hochladen fehlgeschlagen");
    hook.unmount();
  });

  it("keeps a parent TranslationProvider without translations", () => {
    const hook = renderHook(useProbe, {
      wrapper: ({ children }) => (
        <TranslationProvider
          translations={{ "Upload failed(toast)": "Parent" }}
        >
          <S3Provider api={fakeS3Api()}>{children}</S3Provider>
        </TranslationProvider>
      ),
    });
    expect(hook.current.text).toBe("Parent");
    hook.unmount();
  });
});
