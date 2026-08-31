import { describe, expect, it } from "vitest";
import { listedPartsByteSize } from "./list-parts";

describe("listedPartsByteSize", () => {
  it("sums sizes and can exclude a part number", () => {
    const parts = [
      { PartNumber: 1, Size: 10 },
      { PartNumber: 2, Size: 5 },
    ];
    expect(listedPartsByteSize(parts)).toBe(15);
    expect(listedPartsByteSize(parts, 1)).toBe(5);
    expect(listedPartsByteSize([])).toBe(0);
    expect(listedPartsByteSize([{ PartNumber: 1 }])).toBe(0);
  });
});
