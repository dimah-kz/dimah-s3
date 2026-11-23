import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/render";
import { useToastOwner } from "@/hooks/use-toast-owner";

function Owner({
  id,
  label,
  weak,
}: {
  id: string;
  label: string;
  weak?: boolean;
}) {
  const active = useToastOwner(id, { weak });
  return active ? <p>{label}</p> : null;
}

function activeLabels() {
  return screen.queryAllByRole("paragraph").map((node) => node.textContent);
}

describe("useToastOwner", () => {
  it("activates a lone strong owner after mount", () => {
    render(<Owner id="upload" label="toasts" />);

    expect(activeLabels()).toEqual(["toasts"]);
  });

  it("keeps the first strong owner active and warns once per extra one", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <>
        <Owner id="upload" label="first" />
        <Owner id="upload" label="second" />
        <Owner id="upload" label="third" />
      </>,
    );

    expect(activeLabels()).toEqual(["first"]);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain("toast owner");
  });

  it("keeps the same owner active under StrictMode effect replays", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <>
        <Owner id="upload" label="first" />
        <Owner id="upload" label="second" />
      </>,
      { reactStrictMode: true },
    );

    expect(activeLabels()).toEqual(["first"]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it("hands over to the next strong owner when the active one unmounts", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { rerender } = render(
      <>
        <Owner id="upload" label="first" />
        <Owner id="upload" label="second" />
      </>,
    );
    rerender(<Owner id="upload" label="second" />);

    expect(activeLabels()).toEqual(["second"]);
  });

  it("does not warn in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <>
        <Owner id="upload" label="first" />
        <Owner id="upload" label="second" />
      </>,
    );

    expect(activeLabels()).toEqual(["first"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("lets a weak owner yield to a strong one and take over again", () => {
    const { rerender } = render(<Owner id="upload" label="built-in" weak />);
    expect(activeLabels()).toEqual(["built-in"]);

    rerender(
      <>
        <Owner id="upload" label="built-in" weak />
        <Owner id="upload" label="explicit" />
      </>,
    );
    expect(activeLabels()).toEqual(["explicit"]);

    rerender(<Owner id="upload" label="built-in" weak />);
    expect(activeLabels()).toEqual(["built-in"]);
  });

  it("keeps only the first weak owner active, without a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <>
        <Owner id="upload" label="first" weak />
        <Owner id="upload" label="second" weak />
      </>,
    );

    expect(activeLabels()).toEqual(["first"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("tracks each hook instance on its own", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <>
        <Owner id="upload" label="upload" />
        <Owner id="delete" label="delete built-in" weak />
        <Owner id="download" label="download" />
      </>,
    );

    expect(activeLabels()).toEqual(["upload", "delete built-in", "download"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns again for owners that mount later", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pair = (
      <>
        <Owner id="upload" label="first" />
        <Owner id="upload" label="second" />
      </>
    );

    const { rerender } = render(pair);
    rerender(null);
    rerender(pair);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("is inactive on the server", () => {
    expect(renderToString(<Owner id="upload" label="toasts" />)).toBe("");
  });
});
