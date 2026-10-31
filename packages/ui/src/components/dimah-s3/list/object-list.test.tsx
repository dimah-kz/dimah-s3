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
import { memoryObjectSource } from "@dimah-s3/react/engine";
import { act, render, screen, within } from "@/test/render";
import { toast } from "@/components/ui/toast";
import { DeleteToasts } from "@/components/dimah-s3/delete/delete-toasts";
import {
  ObjectList,
  type ObjectListProps,
} from "@/components/dimah-s3/list/object-list";
import { Upload } from "@/components/dimah-s3/upload/upload";
import { UploadDropzone } from "@/components/dimah-s3/upload/upload-dropzone";
import { UploadTrigger } from "@/components/dimah-s3/upload/upload-trigger";
import { UploadToasts } from "@/components/dimah-s3/upload/upload-toasts";

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
    uploadTransport: vi.fn(async () => {}),
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
  /** Source additions over the memory source. */
  source?: Pick<ObjectListSource<Item>, "uploadOptions" | "createFolder">;
  limits?: { maxBytes?: number; maxFiles?: number };
  /** Usage line without limits. */
  usage?: boolean;
  /** Let folders join the selection too. */
  selectFolders?: boolean;
  /** ObjectList props, from the hooks. */
  props?: (hooks: Hooks) => Partial<ObjectListProps<Item>>;
  /** Siblings of the list, such as explicit toast owners. */
  extra?: (hooks: Hooks) => ReactNode;
};

/** Renders an ObjectList over real hooks and a fake `S3Api`. */
function renderList(options: RenderOptions = {}) {
  const items = initialItems();
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
    const selection = useObjectListSelection(
      list,
      options.selectFolders ? { isSelectable: () => true } : {},
    );
    const upload = useUpload({ api, route: ROUTE, maxFiles: 5 });
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

async function openMenu(name: string, label = "File actions") {
  const user = userEvent.setup();
  await user.click(within(entry(name)).getByRole("button", { name: label }));
  return screen.findByRole("menu");
}

function toastTitles() {
  return vi.mocked(toast.add).mock.calls.map(([options]) => options.title);
}

describe("ObjectList", () => {
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
            throw s3Error("CONFLICT");
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
        props: () => ({ toolbar: <UploadDropzone aria-label="Drop here" /> }),
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
      expect(dropzone.hasAttribute("data-drag-active")).toBe(true);
    });

    it("stays quiet while files are dragged over another target of its hook", async () => {
      const { container } = renderList({
        extra: ({ upload }) => (
          <Upload upload={upload}>
            <UploadDropzone aria-label="Outside" />
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

  it("puts entries off screen out of layout with content-visibility", async () => {
    renderList();
    await settle();

    const item = entry("a.txt").closest("[role=listitem]");
    expect(item?.className).toContain("[content-visibility:auto]");
  });
});
