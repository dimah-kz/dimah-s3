import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/render";
import { Toaster, toast } from "@/components/dimah-s3/toast/toaster";

afterEach(() => {
  act(() => toast.close());
});

describe("toast", () => {
  it("shows, updates and closes a toast with one action", async () => {
    const onClick = vi.fn();
    render(<Toaster />);

    let id = "";
    act(() => {
      id = toast.add({
        type: "error",
        title: "Upload failed",
        description: "Network error",
        timeout: 0,
        action: { label: "Retry", onClick },
      });
    });
    expect(await screen.findByText("Upload failed")).toBeDefined();
    expect(screen.getByText("Network error")).toBeDefined();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledOnce();

    act(() => toast.update(id, { title: "Retrying" }));
    expect(await screen.findByText("Retrying")).toBeDefined();

    act(() => toast.close(id));
    await vi.waitFor(() => {
      expect(screen.queryByText("Retrying")).toBeNull();
    });
  });
});
