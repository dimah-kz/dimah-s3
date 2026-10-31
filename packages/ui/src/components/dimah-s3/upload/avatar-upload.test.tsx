import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import {
  s3Error,
  type S3Api,
  type UploadPresignResponse,
} from "@dimah-s3/core";
import {
  useFormatDimahError,
  useUpload,
  type S3ApiUploadTransport,
  type UseUploadOptions,
} from "@dimah-s3/react";
import { act, render, renderHook, screen, waitFor } from "@/test/render";
import {
  AvatarUpload,
  type AvatarUploadProps,
} from "@/components/dimah-s3/upload/avatar-upload";

const unused = () => Promise.reject(new Error("not used in this test"));

/**
 * An `S3Api` whose `avatars` route takes images up to 1 KB at
 * `avatars/<name>`, sends bytes through `uploadTransport` and presigns
 * `https://s3.test/<key>`.
 */
function fakeApi() {
  return {
    catalog: vi.fn<S3Api["catalog"]>(async () => ({
      routes: {
        avatars: {
          upload: {
            enabled: true,
            maxFileSize: 1024,
            multipart: false,
            checksum: false,
          },
          download: {
            enabled: true,
            maxExpiresIn: 3600,
            disposition: "inline",
            inlineTypes: ["image/png"],
            mode: "presign",
          },
          delete: { enabled: false },
        },
      },
    })),
    upload: vi.fn<S3Api["upload"]>(
      async ({ name }) =>
        ({
          key: `avatars/${name}`,
          bucket: "bucket",
          url: "https://s3.test/put",
          expiresIn: 600,
          ticket: name,
          method: "PUT",
          headers: {},
        }) satisfies UploadPresignResponse,
    ),
    confirm: vi.fn<S3Api["confirm"]>(async ({ ticket }) => ({
      key: `avatars/${ticket}`,
      bucket: "bucket",
      name: ticket,
      size: 5,
      type: "image/png",
      metadata: {},
    })),
    download: vi.fn<S3Api["download"]>(async (payload) => ({
      key: payload.key,
      bucket: "bucket",
      url: `https://s3.test/${payload.key}`,
      mode: "presign",
      disposition: "inline",
      expiresIn: 600,
    })),
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

type Props = Partial<Omit<AvatarUploadProps, "upload">>;

/** Renders an `AvatarUpload` with a real `useUpload` on the `avatars` route. */
function renderAvatar(
  props: Props = {},
  options: Partial<UseUploadOptions> = {},
) {
  const api = fakeApi();
  function View() {
    const upload = useUpload({ api, route: "avatars", ...options });
    return (
      <AvatarUpload
        upload={upload}
        api={api}
        route="avatars"
        label="Change profile photo"
        {...props}
      />
    );
  }
  return { api, ...render(<View />) };
}

function avatarButton() {
  return screen.getByRole("button", { name: "Change profile photo" });
}

function liveRegion() {
  const region = document.querySelector("[aria-live=polite]");
  if (!region) throw new Error("No live region");
  return region;
}

function image(name: string, bytes = "hello") {
  return new File([bytes], name, { type: "image/png" });
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

function formatted(error: ReturnType<typeof s3Error>) {
  const { result } = renderHook(() => useFormatDimahError());
  return result.current(error);
}

beforeEach(() => {
  // jsdom has no object URLs; the upload hook makes one per image preview.
  let next = 0;
  Object.assign(URL, {
    createObjectURL: vi.fn(() => `blob:preview-${++next}`),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("AvatarUpload", () => {
  it("is a button named by its label with a placeholder", () => {
    const { api } = renderAvatar();

    expect(avatarButton().getAttribute("type")).toBe("button");
    expect(avatarButton().querySelector("img")).toBeNull();
    expect(api.download).not.toHaveBeenCalled();
    expect(liveRegion().textContent).toBe("");
  });

  it("shows the current image", async () => {
    renderAvatar({ objectKey: "avatars/me.png" });

    await waitFor(() =>
      expect(avatarButton().querySelector("img")?.getAttribute("src")).toBe(
        "https://s3.test/avatars/me.png",
      ),
    );
  });

  it("opens the picker on click", async () => {
    renderAvatar();
    const input = document.querySelector<HTMLInputElement>("input[type=file]");
    const click = vi.spyOn(input as HTMLInputElement, "click");

    await userEvent.click(avatarButton());

    expect(click).toHaveBeenCalledOnce();
  });

  it("shows progress and announces each phase of an upload", async () => {
    const onChange = vi.fn();
    const { api } = renderAvatar({ objectKey: "avatars/old.png", onChange });
    let finish: () => void = () => {};
    api.uploadTransport.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );

    await pick([image("new.png")]);
    await waitFor(() => expect(api.uploadTransport).toHaveBeenCalledOnce());

    expect(avatarButton().getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("progressbar").getAttribute("aria-label")).toBe(
      "Progress for new.png",
    );
    expect(liveRegion().textContent).toBe("Uploading…");
    expect(avatarButton().querySelector("img")?.getAttribute("src")).toBe(
      "blob:preview-1",
    );

    await act(async () => finish());

    await waitFor(() =>
      expect(liveRegion().textContent).toBe("Upload complete"),
    );
    expect(avatarButton().hasAttribute("aria-busy")).toBe(false);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ key: "avatars/new.png" }),
    );
  });

  it("announces a failed upload and shows the stored image again", async () => {
    const onChange = vi.fn();
    const { api } = renderAvatar({ objectKey: "avatars/old.png", onChange });
    api.confirm.mockRejectedValueOnce(s3Error("FORBIDDEN"));

    await pick([image("new.png")]);

    await waitFor(() =>
      expect(liveRegion().textContent).toBe(formatted(s3Error("FORBIDDEN"))),
    );
    await waitFor(() =>
      expect(avatarButton().querySelector("img")?.getAttribute("src")).toBe(
        "https://s3.test/avatars/old.png",
      ),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("announces a rejected file", async () => {
    const { api } = renderAvatar();

    await pick([image("huge.png", "x".repeat(2048))]);

    await waitFor(() =>
      expect(liveRegion().textContent).toBe(
        formatted(s3Error("FILE_TOO_LARGE", { size: 2048, maxFileSize: 1024 })),
      ),
    );
    expect(api.upload).not.toHaveBeenCalled();
  });

  it("uploads an image dropped on it", async () => {
    const { api } = renderAvatar();
    const file = image("dropped.png");
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: {
        files: [file],
        types: ["Files"],
        items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      },
    });

    await act(async () => {
      avatarButton().dispatchEvent(drop);
    });

    await waitFor(() => expect(api.upload).toHaveBeenCalledOnce());
    expect(api.upload.mock.calls[0][0]).toMatchObject({ name: "dropped.png" });
  });

  it("is disabled with the hook", () => {
    renderAvatar({}, { disabled: true });

    expect(avatarButton().hasAttribute("disabled")).toBe(true);
  });

  it("sizes itself", () => {
    renderAvatar({ size: 64 });

    const root = avatarButton().parentElement;
    expect(root?.style.width).toBe("64px");
    expect(root?.style.height).toBe("64px");
  });
});
