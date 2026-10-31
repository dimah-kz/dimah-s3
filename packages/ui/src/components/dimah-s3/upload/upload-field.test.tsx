import { useState, type ReactNode } from "react";
import { describe, expect, it, vi, type Mock } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  s3Error,
  type S3Api,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import {
  useUpload,
  type S3ApiUploadTransport,
  type UseUploadOptions,
  type UseUploadReturn,
} from "@dimah-s3/react";
import { act, render, screen, waitFor } from "@/test/render";
import { useUploadContext } from "@/components/dimah-s3/upload/upload";
import { UploadDropzone } from "@/components/dimah-s3/upload/upload-dropzone";
import {
  UploadField,
  UploadFieldValue,
  useUploadFieldContext,
  type UploadFieldProps,
} from "@/components/dimah-s3/upload/upload-field";
import { UploadTrigger } from "@/components/dimah-s3/upload/upload-trigger";

const unused = () => Promise.reject(new Error("not used in this test"));

/**
 * An `S3Api` whose `uploads` route stores every file at `uploads/<name>`.
 * Bytes go through `uploadTransport`, and a file named `fail-*` fails to
 * confirm.
 */
function fakeApi() {
  const tickets = new Map<string, { name: string; size: number }>();
  return {
    catalog: vi.fn<S3Api["catalog"]>(async () => ({
      routes: {
        uploads: {
          upload: { enabled: true, multipart: false, checksum: false },
          download: { enabled: false },
          delete: { enabled: false },
        },
      },
    })),
    upload: vi.fn<S3Api["upload"]>(async ({ name, size }) => {
      const ticket = `ticket-${tickets.size + 1}`;
      tickets.set(ticket, { name, size });
      return {
        key: `uploads/${name}`,
        bucket: "bucket",
        url: "https://s3.test/put",
        expiresIn: 600,
        ticket,
        method: "PUT",
        headers: {},
      } satisfies UploadPresignResponse;
    }),
    confirm: vi.fn<S3Api["confirm"]>(async ({ ticket }) => {
      const file = tickets.get(ticket);
      if (!file) throw s3Error("UPLOAD_TICKET_INVALID");
      if (file.name.startsWith("fail-")) throw s3Error("FORBIDDEN");
      return {
        key: `uploads/${file.name}`,
        bucket: "bucket",
        name: file.name,
        size: file.size,
        type: "text/plain",
        metadata: {},
      };
    }),
    download: unused,
    delete: unused,
    deleteMany: unused,
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

type FieldProps = Omit<UploadFieldProps, "upload" | "children">;
type OnFileReject = NonNullable<UseUploadOptions["onFileReject"]>;

/** Renders an `UploadField` with a real `useUpload` on the `uploads` route. */
function renderField(
  field: FieldProps,
  children: ReactNode = (
    <>
      <UploadTrigger />
      <UploadFieldValue />
    </>
  ),
  options: Partial<UseUploadOptions> = {},
) {
  const api = fakeApi();
  function View(props: FieldProps) {
    const upload = useUpload({
      api,
      route: "uploads",
      maxFiles: 5,
      ...options,
    });
    return (
      <form aria-label="Post">
        <UploadField upload={upload} {...props}>
          {children}
        </UploadField>
      </form>
    );
  }
  const view = render(<View {...field} />);
  return {
    api,
    ...view,
    rerender: (props: FieldProps) => view.rerender(<View {...props} />),
  };
}

function textFile(name: string) {
  return new File(["hello"], name, { type: "text/plain" });
}

/** Simulates a picker selection on the hidden file input. */
async function pick(files: File[]) {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  if (!input) throw new Error("No file input");
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** A drop event carrying `files`, shaped like the browser's. */
function dropEvent(files: File[]) {
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(drop, "dataTransfer", {
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
  return drop;
}

/** Opens the picker with the field trigger, then picks `files`. */
async function choose(files: File[]) {
  await userEvent.click(screen.getByRole("button", { name: "Upload files" }));
  await pick(files);
}

/** The values the form submits for `name`. */
function submitted(name: string) {
  const form = screen.getByRole("form", { name: "Post" });
  return new FormData(form as HTMLFormElement).getAll(name);
}

/** Each rejected file name with its first error code, across calls. */
function rejectedNames(onFileReject: Mock<OnFileReject>) {
  return onFileReject.mock.calls.flatMap(([rejections]) =>
    rejections.map(({ file, errors }) => [file.name, errors[0]?.code]),
  );
}

describe("UploadField", () => {
  it("submits a hidden input for every key of the default value", () => {
    renderField({ name: "files", defaultValue: ["a/one.txt", "a/two.txt"] });

    expect(submitted("files")).toEqual(["a/one.txt", "a/two.txt"]);
  });

  it("adds the key of each uploaded file across calls", async () => {
    const onValueChange = vi.fn();
    renderField({ name: "files", defaultValue: ["old.txt"], onValueChange });

    await choose([textFile("a.txt")]);
    await waitFor(() =>
      expect(submitted("files")).toEqual(["old.txt", "uploads/a.txt"]),
    );
    await choose([textFile("b.txt"), textFile("c.txt")]);

    await waitFor(() =>
      expect(submitted("files")).toEqual([
        "old.txt",
        "uploads/a.txt",
        "uploads/b.txt",
        "uploads/c.txt",
      ]),
    );
    expect(onValueChange.mock.calls).toEqual([
      [["old.txt", "uploads/a.txt"]],
      [["old.txt", "uploads/a.txt", "uploads/b.txt", "uploads/c.txt"]],
    ]);
  });

  it("adds only files that uploaded", async () => {
    const { api } = renderField({ name: "files" });

    await choose([textFile("fail-a.txt"), textFile("b.txt")]);

    await waitFor(() => expect(submitted("files")).toEqual(["uploads/b.txt"]));
    expect(api.confirm).toHaveBeenCalledTimes(2);
  });

  it("adds nothing while a file is in flight", async () => {
    const { api } = renderField({ name: "files" });
    let finish: () => void = () => {};
    api.uploadTransport.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    await choose([textFile("a.txt")]);
    await waitFor(() => expect(api.uploadTransport).toHaveBeenCalledOnce());
    expect(submitted("files")).toEqual([]);

    await act(async () => finish());
    await waitFor(() => expect(submitted("files")).toEqual(["uploads/a.txt"]));
  });

  it("leaves out files that uploaded before it mounted", async () => {
    const api = fakeApi();
    function View() {
      const upload = useUpload({ api, route: "uploads" });
      const [shown, setShown] = useState(false);
      return (
        <form aria-label="Post">
          <button type="button" onClick={() => setShown(true)}>
            Show
          </button>
          {shown ? (
            <UploadField upload={upload} name="files">
              <UploadTrigger />
            </UploadField>
          ) : (
            <input {...upload.getInputProps()} />
          )}
        </form>
      );
    }
    render(<View />);
    await pick([textFile("early.txt")]);
    await waitFor(() => expect(api.confirm).toHaveBeenCalledOnce());

    await userEvent.click(screen.getByRole("button", { name: "Show" }));

    expect(submitted("files")).toEqual([]);
  });

  it("caps each call at the files that still fit", async () => {
    const onFileReject = vi.fn<OnFileReject>();
    const { api } = renderField(
      { name: "files", defaultValue: ["old.txt"], maxFiles: 3 },
      <UploadTrigger />,
      { onFileReject },
    );

    await choose([textFile("a.txt"), textFile("b.txt"), textFile("c.txt")]);
    await waitFor(() =>
      expect(submitted("files")).toEqual([
        "old.txt",
        "uploads/a.txt",
        "uploads/b.txt",
      ]),
    );
    expect(api.upload).toHaveBeenCalledTimes(2);
    expect(rejectedNames(onFileReject)).toEqual([["c.txt", "TOO_MANY_FILES"]]);
  });

  it("counts files still in flight against the cap", async () => {
    const onFileReject = vi.fn<OnFileReject>();
    const { api } = renderField(
      { name: "files", maxFiles: 3 },
      <UploadTrigger />,
      { onFileReject, queue: true },
    );
    const finish: (() => void)[] = [];
    api.uploadTransport.mockImplementation(
      () => new Promise<void>((resolve) => finish.push(resolve)),
    );

    await choose([textFile("a.txt"), textFile("b.txt")]);
    await waitFor(() => expect(api.uploadTransport).toHaveBeenCalledTimes(2));
    // Two files are still uploading, so only one more fits.
    await choose([textFile("c.txt"), textFile("d.txt")]);
    await waitFor(() => expect(onFileReject).toHaveBeenCalledOnce());
    expect(rejectedNames(onFileReject)).toEqual([["d.txt", "TOO_MANY_FILES"]]);

    // Files upload a few at a time, so let each one through as it starts.
    api.uploadTransport.mockImplementation(async () => {});
    await act(async () => {
      for (const resolve of finish) resolve();
    });
    await waitFor(() =>
      expect(submitted("files")).toEqual([
        "uploads/a.txt",
        "uploads/b.txt",
        "uploads/c.txt",
      ]),
    );
  });

  it("takes no files once it is full", async () => {
    const { api } = renderField(
      { name: "files", defaultValue: ["a.txt", "b.txt"], maxFiles: 2 },
      <>
        <UploadTrigger />
        <UploadDropzone aria-label="Drop files" />
      </>,
    );
    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    const user = userEvent.setup();

    const trigger = screen.getByRole("button", { name: "Upload files" });
    const dropzone = screen.getByRole("button", { name: "Drop files" });
    // Both stay in the tab order, announced as unavailable.
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.hasAttribute("disabled")).toBe(false);
    expect(dropzone.getAttribute("aria-disabled")).toBe("true");
    expect(dropzone.tabIndex).toBe(0);
    await user.tab();
    expect(document.activeElement).toBe(trigger);
    await user.tab();
    expect(document.activeElement).toBe(dropzone);

    await user.click(trigger);
    await user.keyboard("{Enter}");
    await act(async () => {
      dropzone.dispatchEvent(dropEvent([textFile("c.txt")]));
    });

    expect(click).not.toHaveBeenCalled();
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("keeps focus on the dropzone when its pick fills the field", async () => {
    const { api } = renderField(
      { name: "files", defaultValue: ["a.txt"], maxFiles: 2 },
      <UploadDropzone aria-label="Drop files" />,
    );
    const dropzone = screen.getByRole("button", { name: "Drop files" });
    act(() => dropzone.focus());
    expect(dropzone.hasAttribute("aria-disabled")).toBe(false);

    await pick([textFile("b.txt")]);

    await waitFor(() =>
      expect(submitted("files")).toEqual(["a.txt", "uploads/b.txt"]),
    );
    expect(api.upload).toHaveBeenCalledOnce();
    expect(dropzone.isConnected).toBe(true);
    expect(dropzone.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(dropzone);
  });

  it("caps drops on a dropzone inside it", async () => {
    const { api } = renderField(
      { name: "files", maxFiles: 1 },
      <UploadDropzone />,
    );
    const drop = dropEvent([textFile("a.txt"), textFile("b.txt")]);

    await act(async () => {
      screen.getByRole("button").dispatchEvent(drop);
    });

    await waitFor(() => expect(submitted("files")).toEqual(["uploads/a.txt"]));
    expect(api.upload).toHaveBeenCalledOnce();
  });

  it("follows a controlled value", async () => {
    const onValueChange = vi.fn();
    const { rerender } = renderField({
      name: "files",
      value: ["one.txt"],
      onValueChange,
    });

    await choose([textFile("a.txt")]);
    await waitFor(() =>
      expect(onValueChange).toHaveBeenCalledWith(["one.txt", "uploads/a.txt"]),
    );
    expect(submitted("files")).toEqual(["one.txt"]);

    rerender({ name: "files", value: ["two.txt"], onValueChange });
    expect(submitted("files")).toEqual(["two.txt"]);
    expect(onValueChange).toHaveBeenCalledOnce();
  });

  it("restores its default value when the form resets", async () => {
    const onValueChange = vi.fn();
    renderField({ name: "files", defaultValue: ["old.txt"], onValueChange });
    await choose([textFile("a.txt")]);
    await waitFor(() =>
      expect(submitted("files")).toEqual(["old.txt", "uploads/a.txt"]),
    );

    act(() => {
      (screen.getByRole("form", { name: "Post" }) as HTMLFormElement).reset();
    });

    expect(submitted("files")).toEqual(["old.txt"]);
    expect(screen.queryByText("a.txt")).toBeNull();
    expect(screen.getByText("old.txt")).toBeDefined();
    expect(onValueChange).toHaveBeenLastCalledWith(["old.txt"]);

    // The file that already uploaded is not added back.
    await choose([textFile("b.txt")]);
    await waitFor(() =>
      expect(submitted("files")).toEqual(["old.txt", "uploads/b.txt"]),
    );
  });

  it("clears after a React form action, which resets the form", async () => {
    const save = vi.fn<(data: FormData) => Promise<void>>(async () => {});
    const api = fakeApi();
    function View() {
      const upload = useUpload({ api, route: "uploads", maxFiles: 5 });
      return (
        <form aria-label="Post" action={save}>
          <UploadField upload={upload} name="files">
            <UploadTrigger />
            <UploadFieldValue />
          </UploadField>
          <button type="submit">Save</button>
        </form>
      );
    }
    render(<View />);
    await choose([textFile("a.txt")]);
    await waitFor(() => expect(submitted("files")).toEqual(["uploads/a.txt"]));

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(submitted("files")).toEqual([]));
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0]?.[0].getAll("files")).toEqual(["uploads/a.txt"]);
    expect(screen.queryByText("a.txt")).toBeNull();
  });

  it("leaves a controlled value alone when the form resets", () => {
    const onValueChange = vi.fn();
    renderField({ name: "files", value: ["one.txt"], onValueChange });

    act(() => {
      (screen.getByRole("form", { name: "Post" }) as HTMLFormElement).reset();
    });

    expect(submitted("files")).toEqual(["one.txt"]);
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it("removes a key from its value list", async () => {
    const onValueChange = vi.fn();
    renderField({ name: "files", onValueChange });
    await choose([textFile("a.txt"), textFile("b.txt")]);
    await waitFor(() => expect(submitted("files")).toHaveLength(2));

    await userEvent.click(screen.getByRole("button", { name: "Remove a.txt" }));

    expect(submitted("files")).toEqual(["uploads/b.txt"]);
    expect(onValueChange).toHaveBeenLastCalledWith(["uploads/b.txt"]);
    expect(screen.queryByText("a.txt")).toBeNull();
    expect(screen.getByText("b.txt")).toBeDefined();
  });

  it("moves focus on when a remove takes the focused item away", async () => {
    renderField({ name: "files", defaultValue: ["a.txt", "b.txt"] });

    screen.getByRole("button", { name: "Remove a.txt" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Remove b.txt" }),
    );

    // The last item leaves the list, so focus goes to the field's trigger.
    await userEvent.keyboard("{Enter}");
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Upload files" }),
    );
  });

  it("names keys it did not upload after their last segment", () => {
    renderField({ name: "files", defaultValue: ["docs/2026/report.pdf"] });

    expect(screen.getByText("report.pdf")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Remove report.pdf" }),
    ).toBeDefined();
  });

  it("shares its value and the room left with its parts", () => {
    function Remaining() {
      const field = useUploadFieldContext();
      return (
        <p>
          {field.name}: {field.value.join(", ")} ({field.remaining} left)
        </p>
      );
    }
    renderField(
      { name: "files", defaultValue: ["a.txt"], maxFiles: 3 },
      <Remaining />,
    );

    expect(screen.getByText("files: a.txt (2 left)")).toBeDefined();
  });

  it("throws for a part rendered outside it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<UploadFieldValue />)).toThrow(
      "UploadField parts must be rendered inside <UploadField>",
    );
  });

  it("passes the hook through unchanged without maxFiles", () => {
    const api = fakeApi();
    let seen: UseUploadReturn | null = null;
    let own: UseUploadReturn | null = null;
    function Probe() {
      seen = useUploadContext().upload;
      return null;
    }
    function View() {
      const upload = useUpload({ api, route: "uploads" });
      own = upload;
      return (
        <UploadField upload={upload} name="files">
          <Probe />
        </UploadField>
      );
    }
    render(<View />);

    expect(seen).toBe(own);
  });
});
