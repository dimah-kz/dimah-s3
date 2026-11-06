import { useState, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  s3Error,
  type S3Api,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import {
  useDelete,
  useDownload,
  useObjectList,
  useObjectListSelection,
  useUpload,
  type DeleteResult,
  type ObjectListSource,
  type S3ApiUploadTransport,
  type UseDeleteReturn,
  type UseUploadReturn,
} from "@dimah-s3/react";
import {
  memoryObjectSource,
  type UploadTransport,
} from "@dimah-s3/react/engine";
import { act, render, screen, within } from "@/test/render";
import { toast } from "@/components/ui/toast";
import { DeleteToasts } from "@/components/dimah-s3/delete/delete-toasts";
import {
  ObjectList,
  type ObjectListProps,
} from "@/components/dimah-s3/list/object-list";
import { Upload } from "@/components/dimah-s3/upload/upload";
import {
  UploadDropzone,
  UploadDropzoneTrigger,
} from "@/components/dimah-s3/upload/upload-dropzone";
import { UploadTrigger } from "@/components/dimah-s3/upload/upload-trigger";
import { UploadToasts } from "@/components/dimah-s3/upload/upload-toasts";
import { ObjectListSearch } from "@/components/dimah-s3/list/object-list-controls";

// jsdom does no layout, so it has no element scrolling.
Element.prototype.scrollTo ??= () => {};
Element.prototype.scrollIntoView ??= () => {};

type Item = { key: string; name: string; size: number; folder: string | null };

const ROUTE = "files";

function initialItems(): Item[] {
  return [
    { key: "a.txt", name: "a.txt", size: 100, folder: null },
    { key: "b.txt", name: "b.txt", size: 200, folder: null },
    { key: "docs/c.txt", name: "c.txt", size: 300, folder: "docs" },
  ];
}

const unused = () => Promise.reject(new Error("not used in this test"));

/**
 * An `S3Api` over `items`. Upload presigns fail with `FORBIDDEN`, so a test
 * reads what reached the server from the `upload` mock; {@link acceptUploads}
 * makes them succeed. `deleteMany` drops the keys from `items`, so a reload
 * no longer lists them.
 */
function fakeApi(items: Item[]) {
  return {
    catalog: vi.fn<S3Api["catalog"]>(async () => ({
      routes: {
        [ROUTE]: {
          upload: {
            enabled: true,
            maxFileSize: 1024,
            multipart: false,
            checksum: false,
          },
          download: {
            enabled: true,
            maxExpiresIn: 3600,
            disposition: "attachment",
            inlineTypes: [],
            mode: "presign",
          },
          delete: { enabled: true },
        },
      },
    })),
    upload: vi.fn<S3Api["upload"]>(async () => {
      throw s3Error("FORBIDDEN");
    }),
    confirm: vi.fn<S3Api["confirm"]>(unused),
    download: vi.fn<S3Api["download"]>(async ({ key }) => ({
      key,
      bucket: "bucket",
      url: `https://s3.test/${key}`,
      mode: "presign",
      disposition: "attachment",
      expiresIn: 3600,
    })),
    delete: vi.fn<S3Api["delete"]>(async ({ key }) => ({
      key,
      bucket: "bucket",
    })),
    deleteMany: vi.fn<S3Api["deleteMany"]>(async ({ keys }) => {
      for (const key of keys) {
        const index = items.findIndex((item) => item.key === key);
        if (index >= 0) items.splice(index, 1);
      }
      return { deleted: [...keys], failed: [] };
    }),
    multipart: {
      init: unused,
      signPart: unused,
      listParts: unused,
      complete: unused,
      abort: unused,
    },
    uploadTransport: vi.fn<UploadTransport>(async () => {}),
  } satisfies S3Api & S3ApiUploadTransport;
}

type Api = ReturnType<typeof fakeApi>;

/** Makes every upload succeed, stored under the file name. */
function acceptUploads(api: Api) {
  api.upload.mockImplementation(
    async ({ name }) =>
      ({
        key: name,
        bucket: "bucket",
        url: "https://s3.test/put",
        expiresIn: 600,
        ticket: name,
        method: "PUT",
        headers: {},
      }) satisfies UploadPresignResponse,
  );
  api.confirm.mockImplementation(async ({ ticket }) => ({
    key: ticket,
    bucket: "bucket",
    name: ticket,
    size: 5,
    type: "text/plain",
    metadata: {},
  }));
}

type Hooks = { upload: UseUploadReturn; remove: UseDeleteReturn };

type RenderOptions = {
  /** Records in place of {@link initialItems}. */
  items?: Item[];
  /** Source additions over the memory source. */
  source?: Pick<
    ObjectListSource<Item>,
    "uploadOptions" | "createFolder" | "renameFile" | "renameFolder"
  >;
  limits?: { maxBytes?: number; maxFiles?: number };
  /** Usage line without limits. */
  usage?: boolean;
  /** Let folders join the selection too. */
  selectFolders?: boolean;
  /** Keep the selection across folders. */
  persist?: boolean;
  /** ObjectList props, from the hooks. */
  props?: (hooks: Hooks) => Partial<ObjectListProps<Item>>;
  /** Siblings of the list, such as explicit toast owners. */
  extra?: (hooks: Hooks) => ReactNode;
  /** The `disabled` option of the list's `useUpload`. */
  uploadDisabled?: boolean;
};

/** Renders an ObjectList over real hooks and a fake `S3Api`. */
function renderList(options: RenderOptions = {}) {
  const items = options.items ?? initialItems();
  const api = fakeApi(items);
  /** Called once per list query. */
  const records = vi.fn(() => items);
  function Harness() {
    const list = useObjectList({
      ...memoryObjectSource(records, {
        getKey: (item) => item.key,
        getFile: (item) => ({ name: item.name, size: item.size }),
        getFolder: (item) => item.folder,
        limits: options.limits,
        usage: options.usage,
      }),
      ...options.source,
    });
    const selection = useObjectListSelection(list, {
      ...(options.selectFolders ? { isSelectable: () => true } : {}),
      persist: options.persist,
    });
    const upload = useUpload({
      api,
      route: ROUTE,
      maxFiles: 5,
      disabled: options.uploadDisabled,
    });
    const remove = useDelete({ api, route: ROUTE });
    const share = useDownload({ api, route: ROUTE });
    const hooks = { upload, remove };
    return (
      <>
        <ObjectList
          list={list}
          selection={selection}
          upload={upload}
          delete={remove}
          share={share}
          {...options.props?.(hooks)}
        />
        {options.extra?.(hooks)}
      </>
    );
  }
  return { api, items, records, ...render(<Harness />) };
}

/** Lets the hooks load the catalog and the list, and run their calls. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

const folderOptions = (parent: string | null) => ({
  metadata: { folder: parent ?? "" },
});

function textFile(name: string) {
  return new File(["hello"], name, { type: "text/plain" });
}

/** A drag event carrying `files`, shaped like the browser's. */
function dragEvent(
  type: "dragenter" | "dragover" | "dragleave" | "drop",
  files: File[],
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files,
      types: ["Files"],
      items: files.map((file) => ({
        kind: "file",
        type: file.type,
        getAsFile: () => file,
      })),
    },
  });
  return event;
}

async function fire(element: Element, event: Event) {
  await act(async () => {
    element.dispatchEvent(event);
  });
  await settle();
}

/** Simulates a picker selection on the list's file input. */
async function pick(files: File[]) {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("No file input");
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}

function sentMetadata(api: Api) {
  return api.upload.mock.calls.map(([payload]) => payload.metadata);
}

/** Polite live regions that say something right now. */
function speakingRegions() {
  return [...document.querySelectorAll("[aria-live=polite]")].filter(
    (region) => region.textContent !== "",
  );
}

/** Matches an accessible name that starts with `name`, as entry buttons do. */
function startsWith(name: string) {
  return (accessibleName: string) => accessibleName.startsWith(name);
}

/** The row or tile element of the entry named `name`. */
function entry(name: string) {
  const trigger = screen.getByRole("button", { name: startsWith(name) });
  const element = trigger.closest<HTMLElement>("[data-slot=object-list-entry]");
  if (!element) throw new Error(`No entry for ${name}`);
  return element;
}

/** The button that opens or selects the entry named `name`. */
function trigger(name: string) {
  return screen.getByRole("button", { name: startsWith(name) });
}

async function openMenu(name: string, label = "File actions") {
  const user = userEvent.setup();
  await user.click(within(entry(name)).getByRole("button", { name: label }));
  return screen.findByRole("menu");
}

function toastTitles() {
  return vi.mocked(toast.add).mock.calls.map(([options]) => options.title);
}

describe("ObjectList", () => {
  describe("Header", () => {
    function header(container: HTMLElement) {
      const element = container.querySelector("[data-slot=object-list-header]");
      if (!element) throw new Error("No header");
      return element;
    }

    it("keeps the path above the selection bar when the selection persists", async () => {
      const user = userEvent.setup();
      const { container } = renderList({ persist: true });
      await settle();

      await user.click(screen.getByRole("checkbox", { name: "Select a.txt" }));

      expect(
        container.querySelector("[data-slot=object-list-selection-bar]"),
      ).not.toBeNull();
      expect(
        container.querySelector("[data-slot=object-list-header-path]"),
      ).not.toBeNull();
      // The bar's select-all is the only one.
      expect(
        screen.getAllByRole("checkbox", { name: /^Select (all|this page)$/ }),
      ).toHaveLength(1);
    });

    it("opens the search from its button across the header", async () => {
      const user = userEvent.setup();
      const { container } = renderList({
        props: () => ({ toolbar: <ObjectListSearch /> }),
      });
      await settle();
      expect(screen.queryByRole("searchbox")).toBeNull();

      await user.click(screen.getByRole("button", { name: "Search files" }));
      const field = screen.getByRole("searchbox", { name: "Search files" });
      expect(document.activeElement).toBe(field);
      expect(header(container).hasAttribute("data-search-open")).toBe(true);

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(header(container).hasAttribute("data-search-open")).toBe(false);
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Search files" }),
      );
    });

    it("keeps the field open while it has text; Escape clears it first", async () => {
      const user = userEvent.setup();
      renderList({ props: () => ({ toolbar: <ObjectListSearch /> }) });
      await settle();

      await user.click(screen.getByRole("button", { name: "Search files" }));
      await user.keyboard("b");
      await user.tab();
      const field = screen.getByRole("searchbox", { name: "Search files" });
      expect((field as HTMLInputElement).value).toBe("b");

      await user.click(field);
      await user.keyboard("{Escape}");
      expect((field as HTMLInputElement).value).toBe("");
      expect(screen.getByRole("searchbox")).toBe(field);
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("searchbox")).toBeNull();
    });

    it("clears and closes with Close search", async () => {
      const user = userEvent.setup();
      renderList({ props: () => ({ toolbar: <ObjectListSearch /> }) });
      await settle();

      await user.click(screen.getByRole("button", { name: "Search files" }));
      await user.keyboard("zzz{Enter}");
      await settle();
      expect(
        screen.queryByRole("button", { name: startsWith("a.txt") }),
      ).toBeNull();

      await user.click(screen.getByRole("button", { name: "Close search" }));
      await settle();
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(
        screen.getByRole("button", { name: startsWith("a.txt") }),
      ).toBeDefined();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Search files" }),
      );
    });

    it("keeps the field in the header with collapsible={false}", async () => {
      const { container } = renderList({
        props: () => ({ toolbar: <ObjectListSearch collapsible={false} /> }),
      });
      await settle();

      expect(
        screen.getByRole("searchbox", { name: "Search files" }),
      ).toBeDefined();
      expect(header(container).hasAttribute("data-search-open")).toBe(false);
    });

    it("lists every folder above the open one in the path menu", async () => {
      const user = userEvent.setup();
      renderList({
        items: [
          {
            key: "docs/2026/q1/r.txt",
            name: "r.txt",
            size: 1,
            folder: "docs/2026/q1",
          },
        ],
      });
      await settle();
      for (const name of ["docs", "2026", "q1"]) {
        await user.click(
          screen.getByRole("button", { name: startsWith(name) }),
        );
        await settle();
      }

      const path = screen.getByRole("navigation");
      expect(
        within(path).getByText("q1").closest("[aria-current=page]"),
      ).not.toBeNull();
      expect(within(path).getByRole("button", { name: "2026" })).toBeDefined();

      await user.click(
        within(path).getByRole("button", { name: "Folders above" }),
      );
      const menu = await screen.findByRole("menu");
      expect(
        within(menu)
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual(["Files", "docs", "2026"]);

      await user.click(within(menu).getByRole("menuitem", { name: "docs" }));
      await settle();
      expect(
        within(path).getByText("docs").closest("[aria-current=page]"),
      ).not.toBeNull();
    });
  });

  describe("New folder", () => {
    it("appears only when the source can create folders", async () => {
      const { unmount } = renderList();
      await settle();
      expect(screen.queryByRole("button", { name: "New folder" })).toBeNull();
      unmount();

      renderList({
        source: { createFolder: async ({ name }) => ({ id: name, name }) },
      });
      await settle();
      expect(screen.getByRole("button", { name: "New folder" })).toBeDefined();
    });

    it("links an invalid name's message to the field", async () => {
      const user = userEvent.setup();
      const createFolder = vi.fn<
        NonNullable<ObjectListSource<Item>["createFolder"]>
      >(async () => {
        throw s3Error("FOLDER_INVALID");
      });
      renderList({ source: { createFolder } });
      await settle();

      await user.click(screen.getByRole("button", { name: "New folder" }));
      const field = screen.getByRole("textbox", { name: "Folder name" });
      expect(document.activeElement).toBe(field);
      await user.type(field, "..{Enter}");

      const message = await screen.findByRole("alert");
      expect(message.textContent).toBe("Folder name is invalid");
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.getAttribute("aria-describedby")).toBe(message.id);
      expect(createFolder).toHaveBeenCalledWith({ parent: null, name: ".." });

      await user.type(field, "x");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(field.hasAttribute("aria-invalid")).toBe(false);
    });

    it("says when the name is taken or empty", async () => {
      const user = userEvent.setup();
      renderList({
        source: {
          createFolder: async () => {
            throw s3Error("FOLDER_EXISTS");
          },
        },
      });
      await settle();

      await user.click(screen.getByRole("button", { name: "New folder" }));
      await user.keyboard("{Enter}");
      expect(screen.getByRole("alert").textContent).toBe("Enter a folder name");

      await user.keyboard("docs{Enter}");
      expect((await screen.findByRole("alert")).textContent).toBe(
        "A folder with this name already exists",
      );
    });

    it("adds the folder and returns focus to the button", async () => {
      const user = userEvent.setup();
      renderList({
        source: { createFolder: async ({ name }) => ({ id: name, name }) },
      });
      await settle();

      await user.click(screen.getByRole("button", { name: "New folder" }));
      await user.keyboard("  Photos  {Enter}");
      await settle();

      expect(screen.getByRole("button", { name: "Photos" })).toBeDefined();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "New folder" }),
      );
    });

    it("closes on Escape", async () => {
      const user = userEvent.setup();
      renderList({
        source: { createFolder: async ({ name }) => ({ id: name, name }) },
      });
      await settle();

      await user.click(screen.getByRole("button", { name: "New folder" }));
      await user.keyboard("Draft{Escape}");

      expect(screen.queryByRole("textbox", { name: "Folder name" })).toBeNull();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "New folder" }),
      );
    });

    it("opens the name field across the header", async () => {
      const user = userEvent.setup();
      const { container } = renderList({
        source: { createFolder: async ({ name }) => ({ id: name, name }) },
        props: () => ({ toolbar: <ObjectListSearch /> }),
      });
      await settle();

      await user.click(screen.getByRole("button", { name: "New folder" }));
      const header = container.querySelector("[data-slot=object-list-header]");
      const form = container.querySelector(
        "[data-slot=object-list-new-folder]",
      );
      expect(header?.hasAttribute("data-folder-open")).toBe(true);
      expect(header?.hasAttribute("data-search-open")).toBe(false);
      expect(form?.hasAttribute("data-expanded")).toBe(true);
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Folder name" }),
      );

      await user.keyboard("{Escape}");
      expect(header?.hasAttribute("data-folder-open")).toBe(false);
      expect(form?.isConnected).toBe(false);
    });
  });

  describe("usage", () => {
    it("draws the limits that come with list.usage", async () => {
      const { container } = renderList({
        limits: { maxBytes: 1000, maxFiles: 4 },
      });
      await settle();

      const usage = container.querySelector("[data-slot=object-list-usage]");
      expect(usage?.textContent).toContain("3 of 4 files");
      expect(usage?.textContent).toContain(" of ");
      expect(usage?.hasAttribute("data-over")).toBe(false);
    });

    it("shows plain totals without limits", async () => {
      const { container } = renderList({ usage: true });
      await settle();

      const usage = container.querySelector("[data-slot=object-list-usage]");
      expect(usage?.textContent).toContain("3 files");
      expect(usage?.textContent).not.toContain(" of ");
    });

    it("marks a reached limit", async () => {
      const { container } = renderList({ limits: { maxFiles: 3 } });
      await settle();

      const usage = container.querySelector("[data-slot=object-list-usage]");
      expect(usage?.hasAttribute("data-over")).toBe(true);
    });
  });

  describe("folder rows", () => {
    it("upload dropped files into that folder", async () => {
      const { api } = renderList({ source: { uploadOptions: folderOptions } });
      await settle();
      const row = entry("docs");

      await fire(row, dragEvent("dragenter", [textFile("a.txt")]));
      expect(row.hasAttribute("data-drag-active")).toBe(true);
      // The list's overlay steps aside, and the live message names the row.
      expect(
        document.querySelector("[data-slot=object-list-drop-overlay]"),
      ).toBeNull();
      expect(speakingRegions().map((region) => region.textContent)).toEqual([
        "Drop to upload into docs",
      ]);
      await fire(row, dragEvent("drop", [textFile("a.txt")]));

      expect(row.hasAttribute("data-drag-active")).toBe(false);
      expect(speakingRegions()).toEqual([]);
      expect(sentMetadata(api)).toEqual([{ folder: "docs" }]);
    });

    it("leave drops to the list without uploadOptions", async () => {
      const { api } = renderList();
      await settle();
      const row = entry("docs");

      await fire(row, dragEvent("dragenter", [textFile("a.txt")]));
      expect(row.hasAttribute("data-drag-active")).toBe(false);
      await fire(row, dragEvent("drop", [textFile("a.txt")]));

      // The frame takes it, with the hook's own options.
      expect(sentMetadata(api)).toEqual([undefined]);
    });

    it("keep opening on click and Enter, with no extra tab stop", async () => {
      const user = userEvent.setup();
      renderList({ source: { uploadOptions: folderOptions } });
      await settle();

      const row = entry("docs");
      expect(row.hasAttribute("tabindex")).toBe(false);
      const trigger = within(row).getByRole("button", { name: "docs" });
      await user.click(trigger);
      await settle();
      expect(
        screen.getByRole("button", { name: startsWith("c.txt") }),
      ).toBeDefined();

      await user.click(screen.getByRole("button", { name: "Files" }));
      await settle();
      within(entry("docs")).getByRole("button", { name: "docs" }).focus();
      await user.keyboard("{Enter}");
      await settle();
      expect(
        screen.getByRole("button", { name: startsWith("c.txt") }),
      ).toBeDefined();
    });

    it("offer Upload to this folder in their menu", async () => {
      const user = userEvent.setup();
      const { api } = renderList({ source: { uploadOptions: folderOptions } });
      await settle();

      const menu = await openMenu("docs", "Folder actions");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Upload to this folder" }),
      );
      await pick([textFile("a.txt")]);

      expect(sentMetadata(api)).toEqual([{ folder: "docs" }]);
    });

    it("disable Upload to this folder while the upload is", async () => {
      renderList({
        source: { uploadOptions: folderOptions },
        uploadDisabled: true,
      });
      await settle();

      const menu = await openMenu("docs", "Folder actions");

      expect(
        within(menu)
          .getByRole("menuitem", { name: "Upload to this folder" })
          .getAttribute("aria-disabled"),
      ).toBe("true");
    });

    it("have no menu when files cannot go into them", async () => {
      renderList();
      await settle();

      expect(
        within(entry("docs")).queryByRole("button", { name: "Folder actions" }),
      ).toBeNull();
    });
  });

  describe("upload", () => {
    it("drops and pastes on the list go into the open folder", async () => {
      const { api, container } = renderList({
        source: { uploadOptions: folderOptions },
      });
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");

      await fire(frame, dragEvent("drop", [textFile("a.txt")]));
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: { files: [textFile("b.txt")] },
      });
      await fire(frame, paste);

      expect(sentMetadata(api)).toEqual([{ folder: "" }, { folder: "" }]);
    });

    it("ignores drops and pastes on the list while the upload is disabled", async () => {
      const { api, container } = renderList({
        source: { uploadOptions: folderOptions },
        uploadDisabled: true,
      });
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");

      await fire(frame, dragEvent("dragenter", [textFile("a.txt")]));
      expect(
        document.querySelector("[data-slot=object-list-drop-overlay]"),
      ).toBeNull();
      await fire(frame, dragEvent("drop", [textFile("a.txt")]));
      const paste = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(paste, "clipboardData", {
        value: { files: [textFile("b.txt")] },
      });
      await fire(frame, paste);

      expect(paste.defaultPrevented).toBe(false);
      expect(api.upload).not.toHaveBeenCalled();
    });

    it("lets an UploadTrigger in the toolbar use the hook and the folder", async () => {
      const user = userEvent.setup();
      const { api } = renderList({
        source: { uploadOptions: folderOptions },
        props: () => ({ toolbar: <UploadTrigger /> }),
      });
      await settle();

      await user.click(screen.getByRole("button", { name: "Upload files" }));
      await pick([textFile("a.txt")]);

      expect(sentMetadata(api)).toEqual([{ folder: "" }]);
    });

    it("lets only a dropzone inside the list announce a drag over it", async () => {
      const { container } = renderList({
        props: () => ({
          toolbar: (
            <UploadDropzone>
              <UploadDropzoneTrigger aria-label="Drop here" />
            </UploadDropzone>
          ),
        }),
      });
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");

      await fire(frame, dragEvent("dragenter", [textFile("a.txt")]));
      expect(speakingRegions().map((region) => region.textContent)).toEqual([
        "Drop to upload into this folder",
      ]);

      const dropzone = screen.getByRole("button", { name: "Drop here" });
      await fire(dropzone, dragEvent("dragenter", [textFile("a.txt")]));
      expect(speakingRegions().map((region) => region.textContent)).toEqual([
        "Drop to upload",
      ]);
      expect(
        dropzone
          .closest("[data-slot=upload-dropzone]")
          ?.hasAttribute("data-drag-active"),
      ).toBe(true);
    });

    it("stays quiet while files are dragged over another target of its hook", async () => {
      const { container } = renderList({
        extra: ({ upload }) => (
          <Upload upload={upload}>
            <UploadDropzone>
              <UploadDropzoneTrigger aria-label="Outside" />
            </UploadDropzone>
          </Upload>
        ),
      });
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");

      await fire(
        screen.getByRole("button", { name: "Outside" }),
        dragEvent("dragenter", [textFile("a.txt")]),
      );

      expect(speakingRegions().map((region) => region.textContent)).toEqual([
        "Drop to upload",
      ]);
      expect(
        container.querySelector("[data-slot=object-list-drop-overlay]"),
      ).toBeNull();
      expect(frame.className).not.toContain("border-dimah-s3-primary");
    });

    it("shows the overlay only while the drag is over the list", async () => {
      const { container } = renderList();
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");

      await fire(frame, dragEvent("dragenter", [textFile("a.txt")]));
      expect(
        container.querySelector("[data-slot=object-list-drop-overlay]"),
      ).not.toBeNull();

      await fire(frame, dragEvent("dragleave", [textFile("a.txt")]));
      expect(
        container.querySelector("[data-slot=object-list-drop-overlay]"),
      ).toBeNull();
      expect(speakingRegions()).toEqual([]);
    });

    it("reloads once each time the queue settles with new uploads", async () => {
      const { api, records, container } = renderList();
      acceptUploads(api);
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");
      const loads = records.mock.calls.length;

      await fire(
        frame,
        dragEvent("drop", [textFile("x.txt"), textFile("y.txt")]),
      );
      await settle();

      expect(api.confirm).toHaveBeenCalledTimes(2);
      expect(records).toHaveBeenCalledTimes(loads + 1);
    });

    it("does not reload for files that uploaded before it mounted", async () => {
      const items = initialItems();
      const api = fakeApi(items);
      acceptUploads(api);
      const records = vi.fn(() => items);
      let upload: UseUploadReturn | null = null;
      function Harness() {
        const list = useObjectList(
          memoryObjectSource(records, {
            getKey: (item) => item.key,
            getFile: (item) => ({ name: item.name, size: item.size }),
          }),
        );
        const current = useUpload({ api, route: ROUTE });
        upload = current;
        const [shown, setShown] = useState(false);
        return shown ? (
          <ObjectList list={list} upload={current} />
        ) : (
          <button type="button" onClick={() => setShown(true)}>
            Show
          </button>
        );
      }
      render(<Harness />);
      await settle();
      await act(async () => {
        await upload?.handleFiles([textFile("early.txt")]);
      });
      await settle();
      expect(api.confirm).toHaveBeenCalledOnce();
      const loads = records.mock.calls.length;

      await userEvent.click(screen.getByRole("button", { name: "Show" }));
      await settle();

      expect(records).toHaveBeenCalledTimes(loads);
    });

    it("shows its own upload toasts without an explicit owner", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const { container } = renderList();
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");

      await fire(frame, dragEvent("drop", [textFile("a.txt")]));

      expect(toastTitles()).toEqual(["Uploading", "Upload failed"]);
    });

    it("shows one upload toast next to an explicit UploadToasts", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const { container } = renderList({
        extra: ({ upload }) => <UploadToasts upload={upload} />,
      });
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");

      await fire(frame, dragEvent("drop", [textFile("a.txt")]));

      // One progress toast and one result, not one per owner.
      expect(toastTitles()).toEqual(["Uploading", "Upload failed"]);
    });
  });

  describe("delete", () => {
    it("confirms, drops the row, and reports react's DeleteResult", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      const onDeleted = vi.fn<(result: DeleteResult) => void>();
      const { api } = renderList({ props: () => ({ onDeleted }) });
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Delete file?",
      });
      expect(dialog.textContent).toContain("a.txt");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(api.deleteMany).toHaveBeenCalledOnce();
      expect(api.deleteMany.mock.calls[0]?.[0].keys).toEqual(["a.txt"]);
      expect(onDeleted).toHaveBeenCalledWith({
        deleted: ["a.txt"],
        failed: [],
        blocked: [],
      });
      expect(
        screen.queryByRole("button", { name: startsWith("a.txt") }),
      ).toBeNull();
      expect(toastTitles()).toEqual(["File deleted"]);
    });

    it("steps its toasts aside for an explicit DeleteToasts", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      renderList({
        extra: ({ remove }) => <DeleteToasts delete={remove} />,
      });
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(toastTitles()).toEqual(["File deleted"]);
    });

    it("shows no toasts with toasts off", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      renderList({ props: () => ({ toasts: false }) });
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(toast.add).not.toHaveBeenCalled();
      expect(
        document.querySelector("[data-slot=object-list-announcer]")
          ?.textContent,
      ).toBe("File deleted a.txt");
    });

    it("announces a failed delete with toasts off", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      const { api } = renderList({ props: () => ({ toasts: false }) });
      api.delete.mockRejectedValue(s3Error("FORBIDDEN"));
      api.deleteMany.mockRejectedValue(s3Error("FORBIDDEN"));
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(toast.add).not.toHaveBeenCalled();
      expect(
        document.querySelector("[data-slot=object-list-announcer]")
          ?.textContent,
      ).toMatch(/^Delete failed /);
      expect(
        screen.getByRole("button", { name: startsWith("a.txt") }),
      ).toBeDefined();
    });

    it("leaves delete results to an explicit DeleteToasts with toasts off", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      renderList({
        props: () => ({ toasts: false }),
        extra: ({ remove }) => <DeleteToasts delete={remove} />,
      });
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(toastTitles()).toEqual(["File deleted"]);
      expect(
        document.querySelector("[data-slot=object-list-announcer]")
          ?.textContent,
      ).toBe("");
    });

    it("moves focus to the entry that takes the deleted row's place", async () => {
      const user = userEvent.setup();
      renderList();
      await settle();

      // Rows: docs, a.txt, b.txt.
      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(
        screen.queryByRole("button", { name: startsWith("a.txt") }),
      ).toBeNull();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: startsWith("b.txt") }),
      );
    });

    it("busies only the row whose key is deleting", async () => {
      const user = userEvent.setup();
      let hooks: Hooks | null = null;
      const { api } = renderList({
        extra: (current) => {
          hooks = current;
          return null;
        },
      });
      let finish = () => {};
      api.delete.mockImplementationOnce(
        ({ key }) =>
          new Promise((resolve) => {
            finish = () => resolve({ key, bucket: "bucket" });
          }),
      );
      await settle();

      act(() => {
        void hooks?.remove.remove("a.txt");
      });
      const busy = await openMenu("a.txt");
      expect(
        within(busy)
          .getByRole("menuitem", { name: "Delete" })
          .hasAttribute("aria-disabled"),
      ).toBe(true);
      await user.keyboard("{Escape}");

      const other = await openMenu("b.txt");
      expect(
        within(other)
          .getByRole("menuitem", { name: "Delete" })
          .hasAttribute("aria-disabled"),
      ).toBe(false);
      await user.keyboard("{Escape}");

      await act(async () => finish());
      await settle();
    });

    it("deletes the selection in one request", async () => {
      const user = userEvent.setup();
      const { api } = renderList();
      await settle();

      await user.click(screen.getByRole("checkbox", { name: "Select a.txt" }));
      await user.click(screen.getByRole("checkbox", { name: "Select b.txt" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Delete 2 files?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(api.deleteMany).toHaveBeenCalledOnce();
      expect(api.deleteMany.mock.calls[0]?.[0].keys).toEqual([
        "a.txt",
        "b.txt",
      ]);
      expect(
        screen.queryByRole("button", { name: startsWith("a.txt") }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: startsWith("b.txt") }),
      ).toBeNull();
      // The deleted files leave the selection, so the bar closes.
      expect(
        document.querySelector("[data-slot=object-list-selection-bar]"),
      ).toBeNull();
    });

    it("notes folders that a bulk delete leaves alone", async () => {
      const user = userEvent.setup();
      renderList({ selectFolders: true });
      await settle();

      await user.click(screen.getByRole("checkbox", { name: "Select docs" }));
      await user.click(screen.getByRole("checkbox", { name: "Select a.txt" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));

      const dialog = await screen.findByRole("alertdialog");
      expect(dialog.textContent).toContain(
        "Selected folders stay in the list.",
      );
    });
  });

  describe("Copy link", () => {
    it("signs one URL with share and copies it", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      const { api } = renderList();
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Copy link" }),
      );
      await settle();

      expect(api.download).toHaveBeenCalledOnce();
      expect(api.download.mock.calls[0]?.[0]).toMatchObject({
        key: "a.txt",
        name: "a.txt",
      });
      expect(await navigator.clipboard.readText()).toBe(
        "https://s3.test/a.txt",
      );
      expect(toastTitles()).toEqual(["Link copied"]);
    });

    it("announces the result instead with toasts off", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      renderList({ props: () => ({ toasts: false }) });
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Copy link" }),
      );
      await settle();

      expect(toast.add).not.toHaveBeenCalled();
      expect(
        document.querySelector("[data-slot=object-list-announcer]")
          ?.textContent,
      ).toContain("Link copied");
    });
  });

  describe("Rename", () => {
    it("is absent until the source can rename that row", async () => {
      const user = userEvent.setup();
      renderList({ source: { uploadOptions: folderOptions } });
      await settle();

      await user.click(
        within(entry("a.txt")).getByRole("button", { name: "File actions" }),
      );
      const files = await screen.findByRole("menu");
      expect(
        within(files).queryByRole("menuitem", { name: "Rename" }),
      ).toBeNull();

      await user.keyboard("{Escape}");
      await user.click(
        within(entry("docs")).getByRole("button", { name: "Folder actions" }),
      );
      const folders = await screen.findByRole("menu");
      expect(
        within(folders).queryByRole("menuitem", { name: "Rename" }),
      ).toBeNull();
    });

    it("renames a file from the menu, keeping the extension unselected", async () => {
      const user = userEvent.setup();
      const renameFile = vi.fn<
        NonNullable<ObjectListSource<Item>["renameFile"]>
      >(async ({ item, name }) => ({ ...item, name }));
      renderList({ source: { renameFile } });
      await settle();

      await user.click(
        within(entry("a.txt")).getByRole("button", { name: "File actions" }),
      );
      await user.click(
        within(await screen.findByRole("menu")).getByRole("menuitem", {
          name: "Rename",
        }),
      );
      const input = await screen.findByRole("textbox", { name: "File name" });
      expect(input).toHaveProperty("selectionStart", 0);
      expect(input).toHaveProperty("selectionEnd", 1);

      await user.keyboard("z{Enter}");
      await settle();

      expect(renameFile).toHaveBeenCalledWith({
        item: expect.objectContaining({ key: "a.txt" }),
        name: "z.txt",
      });
      expect(
        screen.getByRole("button", { name: startsWith("z.txt") }),
      ).toBeDefined();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: startsWith("z.txt") }),
      );
    });

    it("starts from F2 and restores the name on Escape", async () => {
      const user = userEvent.setup();
      const renameFile = vi.fn<
        NonNullable<ObjectListSource<Item>["renameFile"]>
      >(async ({ item, name }) => ({ ...item, name }));
      renderList({ source: { renameFile } });
      await settle();

      entry("a.txt")
        .querySelector<HTMLElement>("[data-slot=object-list-entry-trigger]")
        ?.focus();
      await user.keyboard("{F2}");
      const input = await screen.findByRole("textbox", { name: "File name" });
      await user.keyboard("draft{Escape}");

      expect(renameFile).not.toHaveBeenCalled();
      expect(screen.queryByRole("textbox", { name: "File name" })).toBeNull();
      expect(input).toBeTruthy();
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: startsWith("a.txt") }),
      );
    });

    it("keeps the field open when the rename fails", async () => {
      const user = userEvent.setup();
      renderList({
        source: {
          renameFile: async () => {
            throw s3Error("VALIDATION_ERROR", { issue: "File name" });
          },
        },
      });
      await settle();

      entry("a.txt")
        .querySelector<HTMLElement>("[data-slot=object-list-entry-trigger]")
        ?.focus();
      await user.keyboard("{F2}notes{Enter}");

      expect((await screen.findByRole("alert")).textContent).toBe(
        "Invalid request",
      );
      expect(screen.getByRole("textbox", { name: "File name" })).toBeDefined();
    });

    it("keeps a newer rename open when an older save lands", async () => {
      const user = userEvent.setup();
      const slow = Promise.withResolvers<Item>();
      const renameFile = vi.fn<
        NonNullable<ObjectListSource<Item>["renameFile"]>
      >(async ({ item, name }) =>
        item.key === "a.txt" ? slow.promise : { ...item, name },
      );
      renderList({ source: { renameFile } });
      await settle();

      const trigger = (name: string) =>
        entry(name).querySelector<HTMLElement>(
          "[data-slot=object-list-entry-trigger]",
        );
      act(() => trigger("a.txt")?.focus());
      await user.keyboard("{F2}z");
      // Leaving the field saves it; the save is still running.
      act(() => trigger("b.txt")?.focus());
      await user.keyboard("{F2}");
      const field = await screen.findByRole("textbox", { name: "File name" });
      expect(field).toHaveProperty("value", "b.txt");

      await act(async () => {
        slow.resolve({ key: "a.txt", name: "z.txt", size: 100, folder: null });
      });
      await settle();

      expect(renameFile).toHaveBeenCalledWith({
        item: expect.objectContaining({ key: "a.txt" }),
        name: "z.txt",
      });
      expect(screen.getByRole("textbox", { name: "File name" })).toBe(field);
    });

    it("reaches a row that neither opens nor selects", async () => {
      const user = userEvent.setup();
      const renameFile = vi.fn<
        NonNullable<ObjectListSource<Item>["renameFile"]>
      >(async ({ item, name }) => ({ ...item, name }));
      const { container } = renderList({
        source: { renameFile },
        props: () => ({ selection: undefined }),
      });
      await settle();

      const trigger = container.querySelector<HTMLElement>(
        '[data-slot=object-list-entry-trigger][data-entry-key="file:a.txt"]',
      );
      expect(trigger?.tagName).toBe("DIV");
      expect(trigger?.tabIndex).toBe(-1);

      act(() => trigger?.focus());
      await user.keyboard("{F2}");
      expect(
        await screen.findByRole("textbox", { name: "File name" }),
      ).toBeDefined();
    });

    it("renames a folder", async () => {
      const user = userEvent.setup();
      const renameFolder = vi.fn<
        NonNullable<ObjectListSource<Item>["renameFolder"]>
      >(async ({ folder, name }) => ({ ...folder, name }));
      renderList({ source: { renameFolder } });
      await settle();

      await user.click(
        within(entry("docs")).getByRole("button", { name: "Folder actions" }),
      );
      await user.click(
        within(await screen.findByRole("menu")).getByRole("menuitem", {
          name: "Rename",
        }),
      );
      const input = await screen.findByRole("textbox", { name: "Folder name" });
      expect(input).toHaveProperty("selectionStart", 0);
      expect(input).toHaveProperty("selectionEnd", "docs".length);
      await user.keyboard("notes{Enter}");
      await settle();

      expect(renameFolder).toHaveBeenCalledWith({
        folder: { id: "docs", name: "docs" },
        name: "notes",
      });
      expect(screen.getByRole("button", { name: "notes" })).toBeDefined();
    });
  });

  describe("keyboard", () => {
    /** A list between two buttons, to see where Tab goes. */
    function renderBetween() {
      return renderList({
        props: () => ({ toolbar: <button type="button">Before</button> }),
        extra: () => <button type="button">After</button>,
      });
    }

    const before = () => screen.getByRole("button", { name: "Before" });
    const after = () => screen.getByRole("button", { name: "After" });

    it("makes the entries one tab stop, starting at the first", async () => {
      const user = userEvent.setup();
      const { container } = renderBetween();
      await settle();

      // Rows: docs, a.txt, b.txt. Checkboxes and menus are not tab stops.
      expect([
        ...container.querySelectorAll(
          "[data-slot=object-list-entries] [tabindex='0']",
        ),
      ]).toEqual([trigger("docs")]);

      act(() => before().focus());
      await user.tab();
      expect(document.activeElement).toBe(trigger("docs"));
      await user.tab();
      expect(document.activeElement).toBe(after());
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(trigger("docs"));
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(before());
    });

    it("keeps the tab stop on the entry that last had focus", async () => {
      const user = userEvent.setup();
      renderBetween();
      await settle();

      act(() => trigger("docs").focus());
      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(document.activeElement).toBe(trigger("b.txt"));
      expect(trigger("b.txt").tabIndex).toBe(0);
      expect(trigger("docs").tabIndex).toBe(-1);

      await user.click(after());
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(trigger("b.txt"));
    });

    it("gives the tab stop to the first entry when its entry leaves", async () => {
      const user = userEvent.setup();
      renderList();
      await settle();

      act(() => trigger("a.txt").focus());
      await user.click(trigger("docs"));
      await settle();

      expect(trigger("c.txt").tabIndex).toBe(0);
    });

    it("walks the focused row's own controls with Tab, then leaves", async () => {
      const user = userEvent.setup();
      renderBetween();
      await settle();
      const row = entry("a.txt");

      act(() => trigger("a.txt").focus());
      await user.tab();
      expect(document.activeElement).toBe(
        within(row).getByRole("button", { name: "File actions" }),
      );
      await user.tab();
      expect(document.activeElement).toBe(after());

      act(() => trigger("a.txt").focus());
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(
        within(row).getByRole("checkbox", { name: "Select a.txt" }),
      );
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(before());
    });

    it("moves between entries with the arrows, Home, and End", async () => {
      const user = userEvent.setup();
      renderList();
      await settle();

      act(() => trigger("docs").focus());
      await user.keyboard("{ArrowDown}");
      expect(document.activeElement).toBe(trigger("a.txt"));
      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(document.activeElement).toBe(trigger("b.txt"));
      await user.keyboard("{Home}");
      expect(document.activeElement).toBe(trigger("docs"));
      await user.keyboard("{End}");
      expect(document.activeElement).toBe(trigger("b.txt"));
      await user.keyboard("{ArrowUp}");
      expect(document.activeElement).toBe(trigger("a.txt"));
    });

    it("moves through a row's checkbox, name, and menu with Left and Right", async () => {
      const user = userEvent.setup();
      renderList();
      await settle();
      const row = entry("a.txt");
      const checkbox = within(row).getByRole("checkbox", {
        name: "Select a.txt",
      });
      const menu = within(row).getByRole("button", { name: "File actions" });

      act(() => trigger("a.txt").focus());
      await user.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(checkbox);
      await user.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(checkbox);
      await user.keyboard("{ArrowRight}{ArrowRight}");
      expect(document.activeElement).toBe(menu);
      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(menu);

      // Down goes on to the next entry's name.
      await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowDown}");
      expect(document.activeElement).toBe(trigger("b.txt"));
      expect(trigger("b.txt").tabIndex).toBe(0);
    });

    it("moves between tiles with every arrow in the grid", async () => {
      const user = userEvent.setup();
      renderList({ props: () => ({ defaultView: "grid" }) });
      await settle();

      act(() => trigger("docs").focus());
      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(trigger("a.txt"));
      await user.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(trigger("docs"));
      // jsdom has no layout, so the grid has one column.
      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(document.activeElement).toBe(trigger("b.txt"));
    });
  });

  describe("selection count", () => {
    it("is read out from a live region that was there before it", async () => {
      const user = userEvent.setup();
      const { container } = renderList();
      await settle();
      const region = container.querySelector(
        "[data-slot=object-list-announcer]",
      );
      expect(region?.getAttribute("aria-live")).toBe("polite");
      expect(region?.textContent).toBe("");

      act(() => trigger("a.txt").focus());
      await user.keyboard(" ");
      expect(container.querySelector("[data-slot=object-list-announcer]")).toBe(
        region,
      );
      expect(region?.textContent).toBe("1 selected");
      // The bar shows the count without a live region of its own.
      expect(speakingRegions()).toEqual([region]);

      await user.keyboard("{ArrowDown}{Shift>} {/Shift}");
      expect(region?.textContent).toBe("2 selected");

      await user.keyboard("{Escape}");
      expect(region?.textContent).toBe("");
    });
  });

  describe("rendering", () => {
    it("draws no entry again while an upload reports progress", async () => {
      const renderMeta = vi.fn(() => null);
      const { api, container } = renderList({ props: () => ({ renderMeta }) });
      acceptUploads(api);
      const transfer = Promise.withResolvers<void>();
      let report = (_loaded: number) => {};
      api.uploadTransport.mockImplementation(
        async (_file, _presign, { onProgress }) => {
          report = (loaded) =>
            onProgress?.({ loaded, total: 5, percent: loaded * 20 });
          await transfer.promise;
        },
      );
      await settle();
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");
      const drawn = renderMeta.mock.calls.length;

      await fire(frame, dragEvent("drop", [textFile("x.txt")]));
      for (const loaded of [1, 2, 3, 4]) {
        await act(async () => report(loaded));
      }

      expect(
        container.querySelector("[data-slot=object-list-upload-status]"),
      ).not.toBeNull();
      expect(renderMeta).toHaveBeenCalledTimes(drawn);
      await act(async () => transfer.resolve());
      await settle();
    });

    it("draws only the entries whose selection or tab stop changed", async () => {
      const user = userEvent.setup();
      const renderMeta = vi.fn((_entry: { name: string }) => null);
      renderList({ props: () => ({ renderMeta }) });
      await settle();
      const drawn = () => renderMeta.mock.calls.map(([entry]) => entry.name);

      act(() => trigger("a.txt").focus());
      expect(drawn().slice(-2)).toEqual(["docs", "a.txt"]);
      // The first selection draws every entry: the list is now selecting.
      await user.keyboard(" ");
      renderMeta.mockClear();

      await user.keyboard("{ArrowDown}");
      expect(drawn()).toEqual(["a.txt", "b.txt"]);
      renderMeta.mockClear();
      await user.keyboard(" ");
      expect(drawn()).toEqual(["b.txt"]);
    });

    it("keeps each entry while an inline getFile and isSelectable change", async () => {
      const user = userEvent.setup();
      const renderMeta = vi.fn((_entry: { name: string }) => null);
      function Inline() {
        const [count, setCount] = useState(0);
        const list = useObjectList({
          ...memoryObjectSource(initialItems, {
            getKey: (item) => item.key,
            getFile: (item) => ({ name: item.name, size: item.size }),
            getFolder: (item) => item.folder,
          }),
        });
        const selection = useObjectListSelection(list, {
          isSelectable: (item) => item.kind === "file",
        });
        return (
          <>
            <button type="button" onClick={() => setCount(count + 1)}>
              Render {count}
            </button>
            <ObjectList
              list={list}
              selection={selection}
              renderMeta={renderMeta}
            />
          </>
        );
      }
      render(<Inline />);
      await settle();
      const drawn = renderMeta.mock.calls.length;

      await user.click(screen.getByRole("button", { name: "Render 0" }));
      await user.click(screen.getByRole("button", { name: "Render 1" }));

      expect(renderMeta).toHaveBeenCalledTimes(drawn);
    });
  });

  it("puts entries off screen out of layout with content-visibility", async () => {
    renderList();
    await settle();

    const item = entry("a.txt").closest("[role=listitem]");
    expect(item?.className).toContain("[content-visibility:auto]");
  });
});
