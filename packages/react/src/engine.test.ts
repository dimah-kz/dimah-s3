import { describe, expect, it, vi } from "vitest";

// Any runtime import of a React package from the /engine graph fails the import.
vi.mock("react", () => reactImported("react"));
vi.mock("react/jsx-runtime", () => reactImported("react/jsx-runtime"));
vi.mock("react-dom", () => reactImported("react-dom"));
vi.mock("react-dropzone", () => reactImported("react-dropzone"));
vi.mock("@fuma-translate/react", () => reactImported("@fuma-translate/react"));

function reactImported(name: string): never {
  throw new Error(`@dimah-s3/react/engine imports ${name}`);
}

describe("@dimah-s3/react/engine", () => {
  it("loads without React and exports the plain functions", async () => {
    const engine = await import("./engine");
    expect(Object.keys(engine).sort()).toEqual([
      "DEFAULT_MULTIPART_THRESHOLD",
      "createLocalStorageStore",
      "createMemoryStore",
      "defineApi",
      "formatAcceptLabels",
      "formatSpeed",
      "formatUploadProgress",
      "getUploadAbortKind",
      "loadRouteCatalog",
      "memoryObjectSource",
      "mergeRouteUploadPolicy",
      "multipartResumeKey",
      "objectKeyOf",
      "objectListEntryKey",
      "readObjectListLevel",
      "resolveRouteUploadPolicy",
      "toTimestamp",
      "uploadAbortReason",
      "uploadFile",
    ]);
  });
});
