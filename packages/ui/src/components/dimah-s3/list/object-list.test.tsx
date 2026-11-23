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
import { act, fireEvent, render, screen, within } from "@/test/render";
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
import { useObjectListContext } from "@/components/dimah-s3/list/object-list-context";
import {
  ObjectListUsage,
  ObjectListUsageMeter,
} from "@/components/dimah-s3/list/object-list-usage";
import {
  ObjectListEntryMenu,
  ObjectListEntryMenuItem,
} from "@/components/dimah-s3/list/object-list-entry-menu";
import { ObjectListRow } from "@/components/dimah-s3/list/object-list-entry";
import { ObjectListSearch } from "@/components/dimah-s3/list/object-list-search";
import {
  useObjectListCommands,
  type ObjectListCommands,
} from "@/components/dimah-s3/list/object-list-commands";

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

type Hooks = { upload: UseUploadReturn; remove: UseDeleteReturn; api: Api };

type RenderOptions = {
  /** Records in place of {@link initialItems}. */
  items?: Item[];
  /** Source additions over the memory source. */
  source?: Pick<
    ObjectListSource<Item>,
    | "uploadOptions"
    | "createFolder"
    | "renameFile"
    | "renameFolder"
    | "moveFile"
    | "moveFolder"
    | "deleteFolder"
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
  const commandsRef: { current: ObjectListCommands | null } = { current: null };
  function Harness() {
    const commands = useObjectListCommands();
    commandsRef.current = commands;
    const list = useObjectList({
      ...memoryObjectSource(records, {
        getId: (item) => item.key,
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
    const hooks = { upload, remove, api };
    return (
      <>
        <ObjectList
          list={list}
          selection={selection}
          upload={upload}
          delete={remove}
          share={share}
          commands={commands}
          {...options.props?.(hooks)}
        />
        {options.extra?.(hooks)}
      </>
    );
  }
  return { api, items, records, commands: commandsRef, ...render(<Harness />) };
}

/** Lets the hooks load the catalog and the list, and run their calls. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

const folderOptions = (parent: string | null) => ({
  clientMetadata: { folder: parent ?? "" },
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
  return api.upload.mock.calls.map(([payload]) => payload.clientMetadata);
}

/** Polite live regions that say something right now. */
function speakingRegions() {
  return [...document.querySelectorAll("[aria-live=polite]")].filter(
    (region) => region.textContent !== "",
  );
}

/** `text` without the bidi isolates around names. */
function plain(text: string) {
  return text.replaceAll(/[⁨⁩]/g, "");
}

/** Matches an accessible name that reads `name` once its isolates go. */
function named(name: string) {
  return (accessibleName: string) => plain(accessibleName) === name;
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

/** The actions menu button of entry `name`, named after it. */
function menuButton(name: string) {
  return within(entry(name)).getByRole("button", {
    name: `Actions for ${name}`,
  });
}

async function openMenu(name: string) {
  const user = userEvent.setup();
  await user.click(menuButton(name));
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
      const user = userEvent.setup();
      const { container } = renderList({
        limits: { maxBytes: 1000, maxFiles: 4 },
      });
      await settle();

      const usage = container.querySelector("[data-slot=object-list-usage]");
      expect(usage?.textContent).toContain("3 of 4 files");
      expect(usage?.textContent).toContain(" of ");
      expect(usage?.hasAttribute("data-over")).toBe(false);
      // 600 of 1000 bytes. The file cap stays in the line.
      const meter = within(usage as HTMLElement).getByRole("button", {
        name: "60%",
      });
      await user.hover(meter);
      expect(meter.hasAttribute("data-popup-open")).toBe(true);
      await user.click(meter);
      expect(meter.hasAttribute("data-popup-open")).toBe(true);
    });

    it("shows plain totals without limits", async () => {
      const { container } = renderList({ usage: true });
      await settle();

      const usage = container.querySelector("[data-slot=object-list-usage]");
      expect(usage?.textContent).toContain("3 files");
      expect(usage?.textContent).not.toContain(" of ");
      expect(
        usage?.querySelector("[data-slot=object-list-usage-meter]"),
      ).toBeNull();
    });

    it("marks a reached limit", async () => {
      const { container } = renderList({ limits: { maxFiles: 3 } });
      await settle();

      const usage = container.querySelector("[data-slot=object-list-usage]");
      expect(usage?.hasAttribute("data-over")).toBe(true);
      expect(
        within(usage as HTMLElement).getByRole("button", { name: "100%" }),
      ).toBeTruthy();
    });

    it("keeps the catalog total inside a folder", async () => {
      const user = userEvent.setup();
      const { container } = renderList({
        limits: { maxBytes: 1000, maxFiles: 4 },
      });
      await settle();

      await user.click(
        screen.getByRole("button", { name: startsWith("docs") }),
      );
      await settle();

      const usage = container.querySelector("[data-slot=object-list-usage]");
      expect(usage?.textContent).toContain("600 B of 1000 B");
      expect(usage?.textContent).toContain("3 of 4 files");
      expect(
        within(usage as HTMLElement).getByRole("button", { name: "60%" }),
      ).toBeTruthy();
    });

    it("shows totals passed to it", async () => {
      renderList({
        usage: true,
        props: () => ({
          children: (
            <ObjectListUsage
              usage={{ totalBytes: 5, objectCount: 1, maxFiles: 2 }}
            />
          ),
        }),
      });
      await settle();

      expect(screen.getByText(/1 of 2 files/)).toBeTruthy();
      expect(screen.queryByText(/3 files/)).toBeNull();
    });

    it("hides when usage is null", async () => {
      const { container } = renderList({
        usage: true,
        props: () => ({
          children: <ObjectListUsage usage={null} />,
        }),
      });
      await settle();

      expect(
        container.querySelector("[data-slot=object-list-usage]"),
      ).toBeNull();
    });

    it("replaces the line and still draws the ring", async () => {
      const { container } = renderList({
        limits: { maxBytes: 1000 },
        props: () => ({
          children: (
            <ObjectListUsage>
              {(state) => (
                <>
                  <ObjectListUsageMeter />
                  <span>Kept {state.bytesLabel}</span>
                </>
              )}
            </ObjectListUsage>
          ),
        }),
      });
      await settle();

      expect(screen.getByText("Kept 600 B of 1000 B")).toBeTruthy();
      expect(
        within(
          container.querySelector(
            "[data-slot=object-list-usage]",
          ) as HTMLElement,
        ).getByRole("button", { name: "60%" }),
      ).toBeTruthy();
      expect(screen.queryByText(/3 of/)).toBeNull();
    });
  });

  describe("folder rows", () => {
    it("shows how many files a folder holds and how large it is", async () => {
      renderList();
      await settle();

      const row = entry("docs");
      expect(row.textContent).toContain("1 file");
      expect(row.textContent).toContain("300 B");
    });

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
      const trigger = within(row).getByRole("button", {
        name: startsWith("docs"),
      });
      await user.click(trigger);
      await settle();
      expect(
        screen.getByRole("button", { name: startsWith("c.txt") }),
      ).toBeDefined();

      await user.click(screen.getByRole("button", { name: "Files" }));
      await settle();
      within(entry("docs"))
        .getByRole("button", { name: startsWith("docs") })
        .focus();
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

      const menu = await openMenu("docs");
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

      const menu = await openMenu("docs");

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
        within(entry("docs")).queryByRole("button", {
          name: "Actions for docs",
        }),
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
            getId: (item) => item.key,
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

    it("is not busy for a row delete after its own dialog was dismissed", async () => {
      const user = userEvent.setup();
      const { api } = renderList();
      let finish = () => {};
      api.delete.mockImplementationOnce(
        ({ key }) =>
          new Promise((resolve) => {
            finish = () => resolve({ key, bucket: "bucket" });
          }),
      );
      api.deleteMany.mockImplementationOnce(
        ({ keys }) =>
          new Promise((resolve) => {
            finish = () => resolve({ deleted: [...keys], failed: [] });
          }),
      );
      await settle();

      await user.click(screen.getByRole("checkbox", { name: "Select a.txt" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Delete file?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await settle();

      // The same key, deleted from its row menu this time.
      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const again = await screen.findByRole("alertdialog");
      await user.click(within(again).getByRole("button", { name: "Delete" }));
      await settle();

      // The dialog is open while the row's delete runs, so the bar behind
      // it is hidden from queries by role.
      const bulkDelete = document.querySelector(
        "[data-slot=object-list-selection-bar] button[aria-label=Delete]",
      );
      expect(bulkDelete).not.toBeNull();
      expect(bulkDelete?.hasAttribute("aria-busy")).toBe(false);

      await act(async () => finish());
      await settle();
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

  describe("folder delete", () => {
    const deleteFolder = () => vi.fn(async () => undefined);

    it("deletes a folder with its files from the row menu", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      const remove = deleteFolder();
      const { api } = renderList({ source: { deleteFolder: remove } });
      await settle();

      const menu = await openMenu("docs");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Delete folder?",
      });
      expect(dialog.textContent).toContain("and everything in it");
      expect(api.deleteMany).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(api.deleteMany.mock.calls[0]?.[0].keys).toEqual(["docs/c.txt"]);
      expect(remove).toHaveBeenCalledWith({
        folder: expect.objectContaining({ id: "docs", name: "docs" }),
      });
      expect(
        screen.queryByRole("button", { name: startsWith("docs") }),
      ).toBeNull();
      expect(toastTitles()).toEqual(["File deleted"]);
    });

    it("keeps a folder whose files did not all go", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      const remove = deleteFolder();
      const { api } = renderList({ source: { deleteFolder: remove } });
      api.deleteMany.mockResolvedValueOnce({
        deleted: [],
        failed: [
          { key: "docs/c.txt", error: { code: "FORBIDDEN", message: "No" } },
        ],
      });
      await settle();

      const menu = await openMenu("docs");
      await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog");
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(remove).not.toHaveBeenCalled();
      expect(entry("docs")).toBeTruthy();
    });

    it("deletes selected folders and files in one request", async () => {
      const user = userEvent.setup();
      const remove = deleteFolder();
      const { api } = renderList({ source: { deleteFolder: remove } });
      await settle();

      // Folders are selectable once the source can delete them.
      await user.click(screen.getByRole("checkbox", { name: "Select docs" }));
      await user.click(screen.getByRole("checkbox", { name: "Select a.txt" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", {
        name: "Delete 2 items?",
      });
      await user.click(within(dialog).getByRole("button", { name: "Delete" }));
      await settle();

      expect(api.deleteMany).toHaveBeenCalledOnce();
      expect(api.deleteMany.mock.calls[0]?.[0].keys).toEqual([
        "a.txt",
        "docs/c.txt",
      ]);
      expect(remove).toHaveBeenCalledOnce();
      expect(
        document.querySelector("[data-slot=object-list-selection-bar]"),
      ).toBeNull();
    });

    it("asks to delete the focused entry, or the selection, on Delete", async () => {
      const user = userEvent.setup();
      renderList();
      await settle();

      trigger("a.txt").focus();
      await user.keyboard("{Delete}");
      const one = await screen.findByRole("alertdialog", {
        name: "Delete file?",
      });
      await user.click(within(one).getByRole("button", { name: "Cancel" }));
      await settle();

      await user.click(screen.getByRole("checkbox", { name: "Select a.txt" }));
      await user.click(screen.getByRole("checkbox", { name: "Select b.txt" }));
      trigger("b.txt").focus();
      await user.keyboard("{Meta>}{Backspace}{/Meta}");
      const both = await screen.findByRole("alertdialog", {
        name: "Delete 2 files?",
      });
      expect(both.isConnected).toBe(true);
    });

    it("leaves a focused folder alone on Delete when the source cannot delete it", async () => {
      const user = userEvent.setup();
      renderList();
      await settle();

      trigger("docs").focus();
      await user.keyboard("{Delete}");
      await settle();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
  });

  describe("move", () => {
    /** A source move that rewrites the record's folder. */
    function moveFileIn(items: Item[]) {
      return vi.fn(
        async ({ item, parent }: { item: Item; parent: string | null }) => {
          const record = items.find((entry) => entry.key === item.key);
          if (record) record.folder = parent;
        },
      );
    }

    it("moves a file with Move to and the folder dialog", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      const items = initialItems();
      const moveFile = moveFileIn(items);
      renderList({ items, source: { moveFile } });
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Move to…" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: named('Move "a.txt"'),
      });
      await settle();
      // It opens where the file already is.
      expect(
        within(dialog)
          .getByRole("button", { name: "Move here" })
          .getAttribute("aria-disabled"),
      ).toBe("true");

      await user.click(within(dialog).getByRole("button", { name: "docs" }));
      await settle();
      await user.click(
        within(dialog).getByRole("button", { name: "Move here" }),
      );
      await settle();

      expect(moveFile).toHaveBeenCalledWith({
        item: expect.objectContaining({ key: "a.txt" }),
        parent: "docs",
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(
        screen.queryByRole("button", { name: startsWith("a.txt") }),
      ).toBeNull();
      expect(
        toastTitles().map((title) =>
          typeof title === "string" ? plain(title) : title,
        ),
      ).toEqual(['Moved "a.txt" to "docs"']);
    });

    it("moves the selection from the selection bar", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      const items = initialItems();
      const moveFile = moveFileIn(items);
      renderList({ items, source: { moveFile } });
      await settle();

      await user.click(screen.getByRole("checkbox", { name: "Select a.txt" }));
      await user.click(screen.getByRole("checkbox", { name: "Select b.txt" }));
      await user.click(screen.getByRole("button", { name: "Move" }));
      const dialog = await screen.findByRole("dialog", {
        name: "Move 2 items",
      });
      await settle();
      await user.click(within(dialog).getByRole("button", { name: "docs" }));
      await settle();
      await user.click(
        within(dialog).getByRole("button", { name: "Move here" }),
      );
      await settle();

      expect(moveFile).toHaveBeenCalledTimes(2);
      expect(
        toastTitles().map((title) =>
          typeof title === "string" ? plain(title) : title,
        ),
      ).toEqual(['Moved 2 items to "docs"']);
      expect(
        document.querySelector("[data-slot=object-list-selection-bar]"),
      ).toBeNull();
    });

    it("keeps a folder from opening in the dialog while it moves", async () => {
      const user = userEvent.setup();
      const moveFolder = vi.fn(async () => undefined);
      renderList({ source: { moveFolder } });
      await settle();

      const menu = await openMenu("docs");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Move to…" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: named('Move "docs"'),
      });
      await settle();

      const folder = within(dialog).getByRole<HTMLButtonElement>("button", {
        name: /^docs/,
      });
      expect(folder.disabled).toBe(true);
    });

    it("moves a dragged entry onto a folder row", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const items = initialItems();
      const moveFile = moveFileIn(items);
      renderList({ items, source: { moveFile } });
      await settle();

      const data = new Map<string, string>();
      const transfer = {
        get types() {
          return [...data.keys()];
        },
        setData: (type: string, value: string) => data.set(type, value),
        getData: (type: string) => data.get(type) ?? "",
        effectAllowed: "all",
        dropEffect: "none",
        files: [],
        items: [],
      };
      const drag = (type: string) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "dataTransfer", { value: transfer });
        return event;
      };

      const source = entry("a.txt");
      expect(source.getAttribute("draggable")).toBe("true");
      await fire(source, drag("dragstart"));
      const target = entry("docs");
      await fire(target, drag("dragenter"));
      expect(target.hasAttribute("data-move-over")).toBe(true);
      await fire(target, drag("drop"));

      expect(moveFile).toHaveBeenCalledWith({
        item: expect.objectContaining({ key: "a.txt" }),
        parent: "docs",
      });
      expect(target.hasAttribute("data-move-over")).toBe(false);
    });

    it("has no Move without move functions on the source", async () => {
      renderList();
      await settle();

      expect(entry("a.txt").hasAttribute("draggable")).toBe(false);
      const menu = await openMenu("a.txt");
      expect(
        within(menu).queryByRole("menuitem", { name: "Move to…" }),
      ).toBeNull();
    });
  });

  describe("thumbnails", () => {
    it("signs an image thumbnail through the route", async () => {
      const { api } = renderList({
        items: [
          { key: "p.png", name: "p.png", size: 10, folder: null },
          { key: "a.txt", name: "a.txt", size: 10, folder: null },
        ],
        props: ({ api: listApi }) => ({
          thumbnails: { route: ROUTE, api: listApi },
        }),
      });
      await settle();
      await settle();

      const image = entry("p.png").querySelector("img");
      expect(image?.getAttribute("src")).toBe("https://s3.test/p.png");
      expect(entry("a.txt").querySelector("img")).toBeNull();
      expect(api.download).toHaveBeenCalledOnce();
    });
  });

  describe("folder drops", () => {
    it("recreates a dropped folder's folders and uploads into them", async () => {
      const createFolder = vi.fn(
        async ({ parent, name }: { parent: string | null; name: string }) => ({
          id: parent ? `${parent}/${name}` : name,
          name,
        }),
      );
      const { api, container } = renderList({
        source: { uploadOptions: folderOptions, createFolder },
      });
      await settle();

      const file = textFile("a.txt");
      const event = new Event("drop", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", {
        value: {
          files: [file],
          types: ["Files"],
          items: [
            {
              kind: "file",
              type: file.type,
              getAsFile: () => file,
              webkitGetAsEntry: () => ({
                isFile: true,
                isDirectory: false,
                fullPath: "/Photos/2026/a.txt",
              }),
            },
          ],
        },
      });
      const frame = container.querySelector("[data-slot=object-list]");
      if (!frame) throw new Error("No frame");
      await fire(frame, event);
      await settle();

      expect(createFolder.mock.calls.map(([input]) => input)).toEqual([
        { parent: null, name: "Photos" },
        { parent: "Photos", name: "2026" },
      ]);
      expect(sentMetadata(api)).toEqual([{ folder: "Photos/2026" }]);
    });
  });

  describe("custom parts", () => {
    it("takes its own rows in the entry menu", async () => {
      const user = userEvent.setup();
      const star = vi.fn();
      renderList({
        props: () => ({
          renderActions: () => (
            <ObjectListEntryMenu>
              <ObjectListEntryMenuItem onClick={star}>
                Star
              </ObjectListEntryMenuItem>
            </ObjectListEntryMenu>
          ),
        }),
      });
      await settle();

      const menu = await openMenu("a.txt");
      await user.click(within(menu).getByRole("menuitem", { name: "Star" }));

      expect(star).toHaveBeenCalledOnce();
    });

    it("keeps the default menu on a row drawn by renderEntry", async () => {
      renderList({
        props: () => ({
          renderEntry: (entry) => <ObjectListRow entry={entry} />,
        }),
      });
      await settle();

      const menu = await openMenu("a.txt");
      expect(
        within(menu).getByRole("menuitem", { name: "Copy link" }),
      ).toBeDefined();
    });

    it("shares the root label and the list commands through the context", async () => {
      function Probe() {
        const { rootLabel, startNewFolder } = useObjectListContext();
        return (
          <button type="button" onClick={startNewFolder}>
            New folder in {rootLabel}
          </button>
        );
      }
      const user = userEvent.setup();
      renderList({
        source: { createFolder: async ({ name }) => ({ id: name, name }) },
        props: () => ({ rootLabel: "Drive", toolbar: <Probe /> }),
      });
      await settle();

      await user.click(
        screen.getByRole("button", { name: "New folder in Drive" }),
      );

      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Folder name" }),
      );
    });
  });

  describe("Copy link", () => {
    /** A `ClipboardItem` that takes promises, as browsers' does. */
    class FakeClipboardItem {
      readonly items: Record<string, Blob | string | Promise<Blob | string>>;

      constructor(
        items: Record<string, Blob | string | Promise<Blob | string>>,
      ) {
        this.items = items;
      }

      get types() {
        return Object.keys(this.items);
      }

      async getType(type: string): Promise<Blob> {
        const value = await this.items[type];
        return typeof value === "string" ? new Blob([value], { type }) : value;
      }
    }

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

    it("starts the clipboard write in the click, before the URL is signed", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      // Safari refuses a write that starts after the request: a
      // ClipboardItem takes the URL as a promise instead.
      vi.stubGlobal("ClipboardItem", FakeClipboardItem);
      const user = userEvent.setup();
      const { api } = renderList();
      await settle();
      const sign = Promise.withResolvers<void>();
      const signed = api.download.getMockImplementation();
      api.download.mockImplementationOnce(async (...args) => {
        await sign.promise;
        if (!signed) throw new Error("expected a download implementation");
        return signed(...args);
      });
      const written: string[] = [];
      const write = vi
        .spyOn(navigator.clipboard, "write")
        .mockImplementation(async (items) => {
          const [item] = items as unknown as FakeClipboardItem[];
          written.push(await (await item.getType("text/plain")).text());
        });
      const writeText = vi.spyOn(navigator.clipboard, "writeText");

      const menu = await openMenu("a.txt");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Copy link" }),
      );

      // The write has started while the URL is still being signed.
      expect(write).toHaveBeenCalledOnce();
      expect(written).toEqual([]);

      await act(async () => sign.resolve());
      await settle();

      expect(written).toEqual(["https://s3.test/a.txt"]);
      expect(writeText).not.toHaveBeenCalled();
      expect(toastTitles()).toEqual(["Link copied"]);
    });

    it("falls back to writeText when the browser refuses the item", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      vi.stubGlobal("ClipboardItem", FakeClipboardItem);
      const user = userEvent.setup();
      renderList();
      await settle();
      vi.spyOn(navigator.clipboard, "write").mockRejectedValue(
        new DOMException("Not allowed", "NotAllowedError"),
      );

      const menu = await openMenu("a.txt");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Copy link" }),
      );
      await settle();

      expect(await navigator.clipboard.readText()).toBe(
        "https://s3.test/a.txt",
      );
      expect(toastTitles()).toEqual(["Link copied"]);
    });

    it("shows the URL when the clipboard cannot be written", async () => {
      vi.spyOn(toast, "add").mockReturnValue("toast");
      const user = userEvent.setup();
      renderList();
      await settle();
      vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
        new DOMException("Not allowed", "NotAllowedError"),
      );

      const menu = await openMenu("a.txt");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Copy link" }),
      );
      await settle();

      expect(toastTitles()).toEqual(["Could not copy link"]);
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

      await user.click(menuButton("a.txt"));
      const files = await screen.findByRole("menu");
      expect(
        within(files).queryByRole("menuitem", { name: "Rename" }),
      ).toBeNull();

      await user.keyboard("{Escape}");
      await user.click(menuButton("docs"));
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

      await user.click(menuButton("a.txt"));
      await user.click(
        within(await screen.findByRole("menu")).getByRole("menuitem", {
          name: "Rename",
        }),
      );
      const input = await screen.findByRole("textbox", { name: "File name" });
      expect(input).toHaveProperty("selectionStart", 0);
      expect(input).toHaveProperty("selectionEnd", 1);
      // Inherits the list's direction instead of following the name (#144).
      expect(input.hasAttribute("dir")).toBe(false);

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

      await user.click(menuButton("docs"));
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
        folder: { id: "docs", name: "docs", size: 300, objectCount: 1 },
        name: "notes",
      });
      expect(
        screen.getByRole("button", { name: startsWith("notes") }),
      ).toBeDefined();
    });

    it("gives the field the row's menu room, and a tile's whole width", async () => {
      const user = userEvent.setup();
      const renameFolder = vi.fn<
        NonNullable<ObjectListSource<Item>["renameFolder"]>
      >(async ({ folder, name }) => ({ ...folder, name }));
      const rows = renderList({ source: { renameFolder } });
      await settle();

      trigger("docs").focus();
      await user.keyboard("{F2}");
      const row = (await screen.findByRole("textbox")).closest<HTMLElement>(
        "[data-slot=object-list-entry]",
      );
      expect(
        row?.querySelector("[data-slot=object-list-entry-menu]"),
      ).toBeNull();
      expect(
        row
          ?.querySelector("[data-slot=object-list-rename]")
          ?.getAttribute("data-layout"),
      ).toBe("inline");
      rows.unmount();

      renderList({
        source: { renameFolder },
        props: () => ({ defaultView: "grid" }),
      });
      await settle();
      trigger("docs").focus();
      await user.keyboard("{F2}");
      const tile = (await screen.findByRole("textbox")).closest<HTMLElement>(
        "[data-slot=object-list-entry]",
      );
      const field = tile?.querySelector("[data-slot=object-list-rename]");
      expect(field?.getAttribute("data-layout")).toBe("stacked");
      // The buttons sit under the field, and the tile's overlays step aside.
      expect(field?.lastElementChild?.querySelectorAll("button")).toHaveLength(
        2,
      );
      expect(
        tile?.querySelector("[data-slot=object-list-entry-menu]"),
      ).toBeNull();
      expect(tile?.querySelector("[role=checkbox]")).toBeNull();
    });
  });

  describe("commands", () => {
    it("opens New folder from outside the list", async () => {
      const { commands } = renderList({
        source: { createFolder: async ({ name }) => ({ id: name, name }) },
      });
      await settle();

      act(() => commands.current?.startNewFolder());

      const field = screen.getByRole("textbox", { name: "Folder name" });
      expect(document.activeElement).toBe(field);
    });

    it("opens a row menu from outside and from a right-click", async () => {
      const user = userEvent.setup();
      const { commands } = renderList();
      await settle();

      act(() => commands.current?.openMenu("file:a.txt"));
      const menu = await screen.findByRole("menu");
      expect(
        within(menu).getByRole("menuitem", { name: "Copy link" }),
      ).toBeDefined();

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("menu")).toBeNull();

      fireEvent.contextMenu(entry("b.txt"));
      const next = await screen.findByRole("menu");
      expect(
        within(next).getByRole("menuitem", { name: "Copy link" }),
      ).toBeDefined();
    });

    it("does nothing for a row that is not on screen", async () => {
      const { commands } = renderList();
      await settle();

      act(() => commands.current?.openMenu("missing"));

      expect(screen.queryByRole("menu")).toBeNull();
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
        within(row).getByRole("button", { name: "Actions for a.txt" }),
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
      const menu = within(row).getByRole("button", {
        name: "Actions for a.txt",
      });

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

  describe("search", () => {
    const toolbar = () => ({ toolbar: <ObjectListSearch /> });

    async function search(text: string) {
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /^Search/ }));
      await user.keyboard(`${text}{Enter}`);
      await settle();
      return user;
    }

    function searchBar() {
      return document.querySelector("[data-slot=object-list-search-bar]");
    }

    it("finds files in the folders below and says where each one lives", async () => {
      renderList({ props: toolbar });
      await settle();
      expect(searchBar()).toBeNull();

      await search("C.T");

      const row = entry("c.txt");
      expect(
        row.querySelector("[data-slot=object-list-location]")?.textContent,
      ).toContain("docs");
      // The match runs across the stem and the extension.
      expect(
        [...row.querySelectorAll("[data-slot=file-name-match]")]
          .map((mark) => mark.textContent)
          .join(""),
      ).toBe("c.t");
      expect(searchBar()?.textContent).toContain("1 result");
      expect(
        document.querySelector("[data-slot=object-list-search-announcement]")
          ?.textContent,
      ).toBe("1 result");
      expect(
        screen.queryByRole("button", { name: startsWith("a.txt") }),
      ).toBeNull();
    });

    it("names the open folder in the field and searches everywhere on request", async () => {
      const user = userEvent.setup();
      renderList({ props: toolbar });
      await settle();
      await user.click(trigger("docs"));
      await settle();
      expect(
        screen.getByRole("button", { name: "Search in “docs”" }),
      ).toBeDefined();

      await search("a.t");
      expect(
        screen.getByText("Nothing in “docs” or its folders matches “a.t”."),
      ).toBeDefined();
      expect(
        screen
          .getByRole("radio", { name: "docs" })
          .getAttribute("aria-checked"),
      ).toBe("true");

      await user.click(
        screen.getByRole("button", { name: "Search everywhere" }),
      );
      await settle();
      expect(
        screen
          .getByRole("radio", { name: "Files" })
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        entry("a.txt").querySelector("[data-slot=object-list-location]")
          ?.textContent,
      ).toContain("Files");
      expect(
        screen.getByRole("searchbox", { name: "Search all files" }),
      ).toBeDefined();
    });

    it("clears the search from the empty state", async () => {
      const user = userEvent.setup();
      renderList({ props: toolbar });
      await settle();
      await search("nothing-here");

      const empty = document.querySelector("[data-slot=object-list-empty]");
      if (!(empty instanceof HTMLElement))
        throw new TypeError("No empty state");
      expect(
        within(empty).queryByRole("button", { name: "Search everywhere" }),
      ).toBeNull();
      await user.click(
        within(empty).getByRole("button", { name: "Clear search" }),
      );
      await settle();
      expect(trigger("a.txt")).toBeDefined();
      expect(searchBar()).toBeNull();
    });

    it("opens the folder of a result with Show in folder and focuses it", async () => {
      const user = userEvent.setup();
      renderList({ props: toolbar });
      await settle();
      await search("c.t");

      const menu = await openMenu("c.txt");
      await user.click(
        within(menu).getByRole("menuitem", { name: "Show in folder" }),
      );
      await settle();

      expect(searchBar()).toBeNull();
      // The empty field gives the bar back to the path.
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(
        document.querySelector("[data-slot=object-list-breadcrumb]")
          ?.textContent,
      ).toContain("docs");
      expect(document.activeElement).toBe(trigger("c.txt"));
      expect(entry("c.txt").hasAttribute("data-revealed")).toBe(true);
    });

    it("opens a folder result along its whole path", async () => {
      const user = userEvent.setup();
      renderList({
        items: [
          ...initialItems(),
          {
            key: "docs/2026/r.txt",
            name: "r.txt",
            size: 1,
            folder: "docs/2026",
          },
        ],
        props: toolbar,
      });
      await settle();
      await search("2026");

      await user.click(trigger("2026"));
      await settle();
      const crumbs = document.querySelector(
        "[data-slot=object-list-breadcrumb]",
      );
      expect(crumbs?.textContent).toContain("docs");
      expect(crumbs?.textContent).toContain("2026");
      expect(trigger("r.txt")).toBeDefined();
    });

    it("opens on / and on the unshifted slash key, and leaves Shift+/ alone", async () => {
      const user = userEvent.setup();
      renderList({ props: toolbar });
      await settle();
      trigger("a.txt").focus();

      // What a browser sends. user-event's US map has no Slash key.
      const press = (init: KeyboardEventInit) => {
        act(() => {
          document.activeElement?.dispatchEvent(
            new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              ...init,
            }),
          );
        });
      };
      const searchbox = () => screen.queryByRole("searchbox");

      press({ key: "?", code: "Slash", shiftKey: true });
      press({ key: "؟", code: "Slash", shiftKey: true });
      press({ key: ".", code: "Slash" });
      expect(searchbox()).toBeNull();

      // `/` from another key, including with Shift, is still search.
      press({ key: "/", code: "Digit7", shiftKey: true });
      expect(document.activeElement).toBe(
        screen.getByRole("searchbox", { name: "Search files" }),
      );

      await user.keyboard("{Escape}");
      expect(searchbox()).toBeNull();
      trigger("a.txt").focus();

      // A layout that types a non-ASCII character on the unshifted slash key.
      press({ key: "٫", code: "Slash" });
      expect(document.activeElement).toBe(
        screen.getByRole("searchbox", { name: "Search files" }),
      );
    });

    it("opens with / from the list and moves into the results with ArrowDown", async () => {
      const user = userEvent.setup();
      renderList({ props: toolbar });
      await settle();
      trigger("a.txt").focus();

      await user.keyboard("/");
      const field = screen.getByRole("searchbox", { name: "Search files" });
      expect(document.activeElement).toBe(field);

      await user.keyboard("b.t{Enter}");
      await settle();
      await user.keyboard("{ArrowDown}");
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
            getId: (item) => item.key,
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
