import { describe, expect, it, vi } from "vitest";
import { errors } from "@/errors";
import { openRoute, openStoredTarget, openUploadTarget } from "./resolve-route";
import type { ResolvedDimahS3Config, ResolvedRoute } from "@/types";

const uploads: ResolvedRoute = {
  name: "uploads",
  client: {} as ResolvedRoute["client"],
  bucket: "bucket",
  keyPrefix: "uploads",
  skippedPluginIds: new Set(),
  upload: { enabled: true, multipart: { enabled: false } },
  download: { enabled: false },
  delete: { enabled: false },
};

const config: ResolvedDimahS3Config = { routes: { uploads } };
const request = new Request("http://localhost");

describe("openRoute / openStoredTarget / openUploadTarget", () => {
  it("returns the named route when the feature is on", async () => {
    await expect(openRoute(config, "uploads", request, "upload")).resolves.toBe(
      uploads,
    );
  });

  it("rejects an unknown route name", async () => {
    await expect(
      openRoute(config, "missing", request, "upload"),
    ).rejects.toMatchObject({ code: errors.unknownRoute("missing").code });
  });

  it("rejects a disabled feature", async () => {
    await expect(
      openRoute(config, "uploads", request, "download"),
    ).rejects.toMatchObject({
      code: errors.featureDisabled("download").code,
    });
  });

  it("namespace-checks the stored key", async () => {
    await expect(
      openStoredTarget(
        config,
        { route: "uploads", key: "uploads/a.png" },
        request,
        "upload",
      ),
    ).resolves.toEqual({
      route: uploads,
      key: "uploads/a.png",
      bucket: "bucket",
      stored: {
        request,
        route: "uploads",
        key: "uploads/a.png",
        bucket: "bucket",
      },
    });
    await expect(
      openStoredTarget(
        config,
        { route: "uploads", key: "avatars/a.png" },
        request,
        "upload",
      ),
    ).rejects.toMatchObject({ code: errors.invalidKey().code });
  });

  it("generates an upload key under keyPrefix", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-1111-1111-111111111111",
    );
    await expect(
      openUploadTarget(
        config,
        { route: "uploads", fileName: "a.png", fileSize: 10 },
        request,
        "upload",
      ),
    ).resolves.toMatchObject({
      route: uploads,
      key: "uploads/11111111-1111-1111-1111-111111111111/a.png",
      bucket: "bucket",
      acl: "private",
      stored: {
        request,
        route: "uploads",
        key: "uploads/11111111-1111-1111-1111-111111111111/a.png",
        bucket: "bucket",
      },
    });
  });

  it("rejects multipart init when multipart is off", async () => {
    await expect(
      openUploadTarget(
        config,
        { route: "uploads", fileName: "a.png", fileSize: 10 },
        request,
        "multipart",
      ),
    ).rejects.toMatchObject({
      code: errors.featureDisabled("multipart").code,
    });
  });

  it("rejects a file that fails upload constraints", async () => {
    const constrained: ResolvedRoute = {
      ...uploads,
      upload: {
        enabled: true,
        multipart: { enabled: false },
        fileTypes: ["image/png"],
      },
    };
    await expect(
      openUploadTarget(
        { routes: { uploads: constrained } },
        {
          route: "uploads",
          fileName: "a.pdf",
          fileSize: 10,
          contentType: "application/pdf",
        },
        request,
        "upload",
      ),
    ).rejects.toMatchObject({
      code: errors.fileTypeNotAllowed("a.pdf").code,
    });
  });
});
