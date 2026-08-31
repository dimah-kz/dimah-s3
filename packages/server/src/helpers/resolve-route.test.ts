import { describe, expect, it } from "vitest";
import { errors } from "@/errors";
import { openRoute, openStoredTarget } from "./resolve-route";
import type { ResolvedDimahS3Config, ResolvedRoutePolicy } from "@/types";

const uploads: ResolvedRoutePolicy = {
  name: "uploads",
  client: {} as ResolvedRoutePolicy["client"],
  bucket: "bucket",
  keyPrefix: "uploads",
  skippedPluginIds: new Set(),
  upload: { enabled: true, multipart: { enabled: false } },
  download: { enabled: false },
  delete: { enabled: false },
};

const config: ResolvedDimahS3Config = { routes: { uploads } };
const request = new Request("http://localhost");

describe("openRoute / openStoredTarget", () => {
  it("returns the named route when the feature is on", async () => {
    await expect(
      openRoute(config, "uploads", request, "upload"),
    ).resolves.toBe(uploads);
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
});
