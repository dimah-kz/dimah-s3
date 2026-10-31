import { describe, expect, it, vi } from "vitest";
import { s3Error, type S3Api } from "@dimah-s3/core";
import { fireEvent, render, screen, waitFor } from "@/test/render";
import { ObjectImage } from "@/components/dimah-s3/preview/object-image";

const unused = () => Promise.reject(new Error("not used in this test"));

/** An `S3Api` that presigns `https://s3.test/<key>` for 10 minutes. */
function fakeApi() {
  return {
    catalog: unused,
    upload: unused,
    confirm: unused,
    download: vi.fn<S3Api["download"]>(async (payload) => ({
      key: payload.key,
      bucket: "bucket",
      url: `https://s3.test/${payload.key}`,
      mode: "presign",
      disposition: payload.disposition ?? "attachment",
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
  } satisfies S3Api;
}

describe("ObjectImage", () => {
  it("requires alt", () => {
    // @ts-expect-error `alt` is required, so a missing one fails to compile.
    const element = <ObjectImage route="photos" objectKey="a.png" />;

    expect(element.props).not.toHaveProperty("alt");
  });

  it("shows the image at its inline URL with the other props", async () => {
    const api = fakeApi();
    render(
      <ObjectImage
        api={api}
        route="photos"
        objectKey="cats/tom.png"
        alt="Tom"
        className="rounded"
        loading="lazy"
      />,
    );

    const image = await screen.findByRole("img", { name: "Tom" });
    expect(image.getAttribute("src")).toBe("https://s3.test/cats/tom.png");
    expect(image.className).toBe("rounded");
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(api.download).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "photos",
        key: "cats/tom.png",
        disposition: "inline",
      }),
    );
  });

  it("keeps an empty alt for a decorative image", async () => {
    const { container } = render(
      <ObjectImage api={fakeApi()} route="photos" objectKey="a.png" alt="" />,
    );

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the fallback without a key and signs nothing", () => {
    const api = fakeApi();
    render(
      <ObjectImage
        api={api}
        route="photos"
        objectKey={null}
        alt="Avatar"
        fallback={<span>No photo</span>}
      />,
    );

    expect(screen.getByText("No photo")).toBeDefined();
    expect(api.download).not.toHaveBeenCalled();
  });

  it("shows the fallback while the URL is signed and when signing fails", async () => {
    const api = fakeApi();
    let fail: (error: unknown) => void = () => {};
    api.download.mockImplementationOnce(
      () => new Promise((_, reject) => (fail = reject)),
    );
    render(
      <ObjectImage
        api={api}
        route="photos"
        objectKey="missing.png"
        alt="Missing"
        fallback={<span>No photo</span>}
      />,
    );
    expect(screen.getByText("No photo")).toBeDefined();

    fail(s3Error("OBJECT_NOT_FOUND"));

    await waitFor(() => expect(api.download).toHaveBeenCalledOnce());
    expect(screen.getByText("No photo")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the fallback when the image fails to load", async () => {
    const onError = vi.fn();
    render(
      <ObjectImage
        api={fakeApi()}
        route="photos"
        objectKey="broken.png"
        alt="Broken"
        fallback={<span>No photo</span>}
        onError={onError}
      />,
    );

    fireEvent.error(await screen.findByRole("img", { name: "Broken" }));

    expect(screen.getByText("No photo")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });
});
