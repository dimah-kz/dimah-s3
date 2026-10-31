import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/render";
import { CircleProgress } from "@/components/dimah-s3/attachment/circle-progress";

describe("CircleProgress", () => {
  it("is a progressbar named by its file", () => {
    render(<CircleProgress percent={42.4} fileName="report.pdf" />);

    const bar = screen.getByRole("progressbar", {
      name: "Progress for report.pdf",
    });
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuetext")).toBe("42%");
  });

  it("clamps the value to the 0 to 100 range", () => {
    const { rerender } = render(
      <CircleProgress percent={130} fileName="a.txt" />,
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100",
    );

    rerender(<CircleProgress percent={-5} fileName="a.txt" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );

    rerender(<CircleProgress percent={Number.NaN} fileName="a.txt" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0",
    );
  });
});
