import { describe, expect, it } from "vitest";
import * as root from "./index";

describe("@dimah-s3/react", () => {
  it("exports only hooks, the provider and the client", () => {
    expect(Object.keys(root).sort()).toEqual([
      "S3Provider",
      "createS3Client",
      "useApi",
      "useDelete",
      "useDownload",
      "useFetchDownload",
      "useFormatAcceptLabels",
      "useFormatDate",
      "useFormatDimahError",
      "useFormatEta",
      "useFormatFileSize",
      "useFormatNumber",
      "useFormatSpeed",
      "useObjectList",
      "useObjectListSelection",
      "useObjectUrl",
      "useRouteUploadPolicy",
      "useUpload",
    ]);
  });
});
