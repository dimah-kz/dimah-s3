import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { s3Error } from "@dimah-s3/core";
import {
  useFormatDimahError,
  type DownloadOperation,
  type FetchDownloadOperation,
  type UseDownloadReturn,
  type UseFetchDownloadReturn,
} from "@dimah-s3/react";
import { render, renderHook, screen, waitFor, within } from "@/test/render";
import { Toaster } from "@/components/ui/toast";
import { Download } from "@/components/dimah-s3/download/download";
import { DownloadProgress } from "@/components/dimah-s3/download/download-progress";
import {
  BuiltInDownloadToasts,
  DownloadToasts,
} from "@/components/dimah-s3/download/download-toasts";
import { DownloadTrigger } from "@/components/dimah-s3/download/download-trigger";

const KEY = "docs/report.pdf";

function fetchOperation(
  overrides: Partial<FetchDownloadOperation> = {},
): FetchDownloadOperation {
  return {
    id: "1",
    key: KEY,
    fileName: null,
    fileSize: null,
    phase: "downloading",
    error: null,
    progress: { loaded: 0, total: 0, percent: 0 },
    ...overrides,
  };
}

function navigateOperation(
  overrides: Partial<DownloadOperation> = {},
): DownloadOperation {
  return {
    id: "1",
    key: KEY,
    fileName: null,
    phase: "presigning",
    error: null,
    result: null,
    ...overrides,
  };
}

/** The per-key state fields both hooks derive from `operations`. */
function keyedState<TOp extends DownloadOperation | FetchDownloadOperation>(
  operations: readonly TOp[],
) {
  const pendingKeys = [
    ...new Set(
      operations
        .filter((op) => op.phase === "presigning" || op.phase === "downloading")
        .map((op) => op.key),
    ),
  ];
  return {
    operations,
    get: (key: string) => operations.findLast((op) => op.key === key),
    pendingKeys,
    isPending: pendingKeys.length > 0,
  };
}

let instances = 0;

/** A `useFetchDownload` return. `at` gives the same hook with other operations. */
function fakeFetchDownload(instanceId = `fetch-${++instances}`) {
  const actions = {
    download: vi.fn<UseFetchDownloadReturn["download"]>(async (key) => ({
      status: "aborted",
      key,
    })),
    cancel: vi.fn<UseFetchDownloadReturn["cancel"]>(),
    reset: vi.fn<UseFetchDownloadReturn["reset"]>(),
  };
  const at = (
    operations: readonly FetchDownloadOperation[] = [],
  ): UseFetchDownloadReturn => ({
    mode: "fetch",
    instanceId,
    ...keyedState(operations),
    ...actions,
  });
  return { ...actions, at };
}

/** A `useDownload` return. `at` gives the same hook with other operations. */
function fakeNavigateDownload(instanceId = `navigate-${++instances}`) {
  const actions = {
    download: vi.fn<UseDownloadReturn["download"]>(async (key) => ({
      status: "aborted",
      key,
    })),
    presign: vi.fn<UseDownloadReturn["presign"]>(async (key) => ({
      status: "aborted",
      key,
    })),
    presignMany: vi.fn<UseDownloadReturn["presignMany"]>(async () => ({
      signed: [],
      failed: [],
      blocked: [],
    })),
    cancel: vi.fn<UseDownloadReturn["cancel"]>(),
    reset: vi.fn<UseDownloadReturn["reset"]>(),
  };
  const at = (
    operations: readonly DownloadOperation[] = [],
  ): UseDownloadReturn => ({
    mode: "navigate",
    instanceId,
    ...keyedState(operations),
    ...actions,
  });
  return { ...actions, at };
}

function inRoot(
  download: UseDownloadReturn | UseFetchDownloadReturn,
  children: ReactNode,
) {
  return <Download download={download}>{children}</Download>;
}

describe("Download", () => {
  it("requires its root for the parts", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => render(<DownloadTrigger objectKey={KEY} />)).toThrow(
      "inside <Download>",
    );
  });
});

describe("DownloadTrigger", () => {
  it("navigates to the object with the file name", async () => {
    const download = fakeNavigateDownload();
    render(
      inRoot(
        download.at(),
        <DownloadTrigger objectKey={KEY} fileName="Report.pdf" />,
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(download.download).toHaveBeenCalledWith(KEY, {
      fileName: "Report.pdf",
    });
  });

  it("stays focusable but inert while the URL is signed", async () => {
    const download = fakeNavigateDownload();
    render(
      inRoot(
        download.at([navigateOperation()]),
        <DownloadTrigger objectKey={KEY} />,
      ),
    );

    const button = screen.getByRole("button", { name: "Download" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("data-phase")).toBe("presigning");

    button.focus();
    expect(document.activeElement).toBe(button);
    await userEvent.click(button);
    expect(download.download).not.toHaveBeenCalled();
    expect(download.cancel).not.toHaveBeenCalled();
  });

  it("fetches with the file name and size", async () => {
    const download = fakeFetchDownload();
    render(
      inRoot(
        download.at(),
        <DownloadTrigger objectKey={KEY} fileName="Report.pdf" fileSize={10} />,
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(download.download).toHaveBeenCalledWith(KEY, {
      fileName: "Report.pdf",
      fileSize: 10,
    });
  });

  it("turns into a named cancel control while a fetch runs", async () => {
    const download = fakeFetchDownload();
    render(
      inRoot(
        download.at([
          fetchOperation({ progress: { loaded: 40, total: 100, percent: 40 } }),
        ]),
        <DownloadTrigger objectKey={KEY} aria-label="Download report">
          Get it
        </DownloadTrigger>,
      ),
    );

    const button = screen.getByRole("button", {
      name: "Cancel download of report.pdf",
    });
    expect(button.textContent).toBe("Cancel");
    const fill = button.querySelector<HTMLElement>(
      "[data-slot=download-trigger-fill]",
    );
    expect(fill?.style.width).toBe("40%");
    expect(fill?.getAttribute("aria-hidden")).toBe("true");

    await userEvent.click(button);
    expect(download.cancel).toHaveBeenCalledWith(KEY);
    expect(download.download).not.toHaveBeenCalled();
  });

  it("does not cancel on the second click of a double-click", async () => {
    const download = fakeFetchDownload();
    render(
      inRoot(
        download.at([fetchOperation()]),
        <DownloadTrigger objectKey={KEY} fileName="Q3 report.pdf" />,
      ),
    );

    const button = screen.getByRole("button", {
      name: "Cancel download of Q3 report.pdf",
    });
    await userEvent.pointer([
      { keys: "[MouseLeft]", target: button },
      { keys: "[MouseLeft]", target: button },
    ]);
    // Only the first click of the pair counts.
    expect(download.cancel).toHaveBeenCalledOnce();
  });

  it("fills without a width until the total size is known", () => {
    const download = fakeFetchDownload();
    render(
      inRoot(
        download.at([fetchOperation({ phase: "presigning" })]),
        <DownloadTrigger objectKey={KEY} />,
      ),
    );

    const fill = screen
      .getByRole("button", { name: "Cancel download of report.pdf" })
      .querySelector<HTMLElement>("[data-slot=download-trigger-fill]");
    expect(fill?.style.width).toBe("");
  });

  it("ignores runs of other keys and shows its children", () => {
    const download = fakeFetchDownload();
    render(
      inRoot(
        download.at([fetchOperation({ key: "other.txt" })]),
        <DownloadTrigger objectKey={KEY} aria-label="Download report">
          Get it
        </DownloadTrigger>,
      ),
    );

    const button = screen.getByRole("button", { name: "Download report" });
    expect(button.textContent).toBe("Get it");
    expect(
      button.querySelector("[data-slot=download-trigger-fill]"),
    ).toBeNull();
  });

  it("lets onClick prevent the download", async () => {
    const download = fakeFetchDownload();
    render(
      inRoot(
        download.at(),
        <DownloadTrigger
          objectKey={KEY}
          onClick={(event) => event.preventDefault()}
        />,
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Download" }));

    expect(download.download).not.toHaveBeenCalled();
  });
});

describe("DownloadProgress", () => {
  it("is a progressbar named by its file while bytes arrive", () => {
    const download = fakeFetchDownload();
    render(
      inRoot(
        download.at([
          fetchOperation({
            fileName: "Report.pdf",
            progress: { loaded: 400, total: 1000, percent: 40.4 },
          }),
        ]),
        <DownloadProgress objectKey={KEY} />,
      ),
    );

    const bar = screen.getByRole("progressbar", {
      name: "Progress for Report.pdf",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toMatch(/^400 .+ of .+$/);
  });

  it("is indeterminate until the total size is known", () => {
    const download = fakeFetchDownload();
    const { rerender } = render(
      inRoot(
        download.at([fetchOperation({ phase: "presigning" })]),
        <DownloadProgress objectKey={KEY} />,
      ),
    );

    const bar = screen.getByRole("progressbar", {
      name: "Progress for report.pdf",
    });
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.getAttribute("aria-valuetext")).toBe("Starting…");

    rerender(
      inRoot(
        download.at([
          fetchOperation({ progress: { loaded: 512, total: 0, percent: 0 } }),
        ]),
        <DownloadProgress objectKey={KEY} />,
      ),
    );
    expect(bar.hasAttribute("aria-valuenow")).toBe(false);
    expect(bar.getAttribute("aria-valuetext")).toMatch(/^512 /);
  });

  it("renders nothing with useDownload", () => {
    const download = fakeNavigateDownload();
    const { container } = render(
      inRoot(
        download.at([navigateOperation()]),
        <DownloadProgress objectKey={KEY} />,
      ),
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when no call for the key runs", () => {
    const download = fakeFetchDownload();
    const { container } = render(
      inRoot(
        download.at([
          fetchOperation({ phase: "success" }),
          fetchOperation({ id: "2", key: "other.txt" }),
        ]),
        <DownloadProgress objectKey={KEY} />,
      ),
    );

    expect(container.innerHTML).toBe("");
  });
});

describe("DownloadToasts", () => {
  function toastsFor(
    download: UseDownloadReturn | UseFetchDownloadReturn,
    owners: ReactNode = <DownloadToasts download={download} />,
  ) {
    return (
      <>
        <Toaster />
        {owners}
      </>
    );
  }

  function toastByTitle(title: string) {
    const node = screen
      .getByText(title)
      .closest<HTMLElement>("[data-slot=toast]");
    if (!node) throw new Error(`No toast titled ${title}`);
    return node;
  }

  it("follows a fetch download with progress, Cancel and completion", async () => {
    const download = fakeFetchDownload();
    const { rerender } = render(toastsFor(download.at()));

    rerender(
      toastsFor(
        download.at([
          fetchOperation({
            fileName: "Report.pdf",
            progress: { loaded: 400, total: 1000, percent: 40 },
          }),
        ]),
      ),
    );
    const loading = await screen.findByText("Downloading");
    const toast = within(toastByTitle("Downloading"));
    expect(toast.getByText("Report.pdf")).toBeDefined();
    expect(toast.getByText(/^400 .+ of .+$/)).toBeDefined();
    expect(loading).toBeDefined();

    await userEvent.click(toast.getByRole("button", { name: "Cancel" }));
    expect(download.cancel).toHaveBeenCalledWith(KEY);

    rerender(
      toastsFor(
        download.at([
          fetchOperation({
            fileName: "Report.pdf",
            fileSize: 1000,
            phase: "success",
            progress: { loaded: 1000, total: 1000, percent: 100 },
          }),
        ]),
      ),
    );
    expect(await screen.findByText("Download complete")).toBeDefined();
    await waitFor(() => expect(screen.queryByText("Downloading")).toBeNull());
  });

  it("announces a navigate download once the browser has the URL", async () => {
    const download = fakeNavigateDownload();
    const { rerender } = render(toastsFor(download.at([navigateOperation()])));
    expect(screen.queryByText("Downloading")).toBeNull();

    rerender(toastsFor(download.at([navigateOperation({ phase: "success" })])));

    expect(await screen.findByText("Download started")).toBeDefined();
    expect(screen.getAllByText("Download started")).toHaveLength(1);
  });

  it("shows failures with the formatted error", async () => {
    const error = s3Error("NETWORK_ERROR");
    const { result } = renderHook(() => useFormatDimahError());
    const download = fakeNavigateDownload();
    const { rerender } = render(toastsFor(download.at()));

    rerender(
      toastsFor(download.at([navigateOperation({ phase: "error", error })])),
    );

    await screen.findByText("Download failed");
    expect(
      within(toastByTitle("Download failed")).getByText(result.current(error)),
    ).toBeDefined();
  });

  it("announces a cancelled fetch and closes its progress toast", async () => {
    const download = fakeFetchDownload();
    const { rerender } = render(toastsFor(download.at([fetchOperation()])));
    await screen.findByText("Downloading");

    rerender(toastsFor(download.at([fetchOperation({ phase: "aborted" })])));

    expect(await screen.findByText("Download cancelled")).toBeDefined();
    await waitFor(() => expect(screen.queryByText("Downloading")).toBeNull());
  });

  it("closes the progress toast when the operation is reset", async () => {
    const download = fakeFetchDownload();
    const { rerender } = render(toastsFor(download.at([fetchOperation()])));
    await screen.findByText("Downloading");

    rerender(toastsFor(download.at()));

    await waitFor(() => expect(screen.queryByText("Downloading")).toBeNull());
  });

  it("does not announce calls that settled before it mounted", async () => {
    const download = fakeNavigateDownload();
    const { rerender } = render(
      toastsFor(download.at([navigateOperation({ phase: "success" })])),
    );

    rerender(
      toastsFor(
        download.at([
          navigateOperation({ phase: "success" }),
          navigateOperation({ id: "2", phase: "aborted" }),
        ]),
      ),
    );

    expect(await screen.findByText("Download cancelled")).toBeDefined();
    expect(screen.queryByText("Download started")).toBeNull();
  });

  it("shows each toast once under StrictMode", async () => {
    const download = fakeFetchDownload();
    const { rerender } = render(toastsFor(download.at([fetchOperation()])), {
      reactStrictMode: true,
    });
    await screen.findByText("Downloading");
    expect(screen.getAllByText("Downloading")).toHaveLength(1);

    rerender(toastsFor(download.at([fetchOperation({ phase: "success" })])));

    expect(await screen.findByText("Download complete")).toBeDefined();
    expect(screen.getAllByText("Download complete")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByText("Downloading")).toBeNull());
  });

  it("shows one toast for two owners of the same hook", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const download = fakeNavigateDownload();
    const owners = (hook: UseDownloadReturn) => (
      <>
        <BuiltInDownloadToasts download={hook} />
        <DownloadToasts download={hook} />
        <DownloadToasts download={hook} />
      </>
    );
    const { rerender } = render(
      toastsFor(download.at(), owners(download.at())),
    );

    const settled = download.at([navigateOperation({ phase: "success" })]);
    rerender(toastsFor(settled, owners(settled)));

    expect(await screen.findByText("Download started")).toBeDefined();
    expect(screen.getAllByText("Download started")).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("lets the built-in owner toast when no explicit owner is mounted", async () => {
    const download = fakeNavigateDownload();
    const owner = (hook: UseDownloadReturn) => (
      <BuiltInDownloadToasts download={hook} />
    );
    const { rerender } = render(toastsFor(download.at(), owner(download.at())));

    const settled = download.at([navigateOperation({ phase: "success" })]);
    rerender(toastsFor(settled, owner(settled)));

    expect(await screen.findByText("Download started")).toBeDefined();
  });
});
