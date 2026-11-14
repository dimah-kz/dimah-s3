import { describe, expect, it } from "vitest";
import {
  findSearchMatches,
  matchesSearchText,
  normalizeSearchText,
} from "./search-text";

describe("normalizeSearchText", () => {
  it("lowercases, drops accents, and collapses whitespace", () => {
    expect(normalizeSearchText("  Résumé \t Final.PDF ")).toBe(
      "resume final.pdf",
    );
    expect(normalizeSearchText("ÇA VA")).toBe("ca va");
  });

  it("joins look-alike letters and reads Persian digits", () => {
    expect(normalizeSearchText("كتاب علي")).toBe(
      normalizeSearchText("کتاب علی"),
    );
    expect(normalizeSearchText("فاکتور ۱۴۰۲")).toBe("فاکتور 1402");
    expect(normalizeSearchText("٣")).toBe("3");
    expect(normalizeSearchText("ΟΔΟΣ")).toBe(normalizeSearchText("οδος"));
    expect(normalizeSearchText("Straße")).toBe("strasse");
  });

  it("drops zero-width joiners, the tatweel, and Arabic diacritics", () => {
    expect(normalizeSearchText("می‌خواهم")).toBe("میخواهم");
    expect(normalizeSearchText("کـتـاب")).toBe("کتاب");
    expect(normalizeSearchText("كِتَاب")).toBe(normalizeSearchText("کتاب"));
    expect(normalizeSearchText("آب")).toBe("اب");
  });

  it("keeps wildcard characters as text", () => {
    expect(normalizeSearchText("50%_off\\")).toBe("50%_off\\");
  });
});

describe("matchesSearchText", () => {
  it("matches folded text and treats blank search as a match", () => {
    expect(matchesSearchText("Invoice-March.pdf", "invoice")).toBe(true);
    expect(matchesSearchText("Café menu", "cafe m")).toBe(true);
    expect(matchesSearchText("report.pdf", "invoice")).toBe(false);
    expect(matchesSearchText("anything", "  ")).toBe(true);
  });
});

describe("findSearchMatches", () => {
  it("returns source ranges of every match", () => {
    expect(findSearchMatches("Report report", "REPORT")).toEqual([
      [0, 6],
      [7, 13],
    ]);
    expect(findSearchMatches("Café.pdf", "cafe")).toEqual([[0, 4]]);
  });

  it("maps folded characters back to the characters they came from", () => {
    // A combining accent stays with the letter it sits on.
    expect(findSearchMatches("Café au lait", "é au")).toEqual([[3, 8]]);
    expect(findSearchMatches("Café", "cafe")).toEqual([[0, 5]]);
    expect(findSearchMatches("a  b", "a b")).toEqual([[0, 4]]);
    expect(findSearchMatches("می‌خواهم", "میخ")).toEqual([[0, 4]]);
    expect(findSearchMatches("😀 smile", "smile")).toEqual([[3, 8]]);
  });

  it("merges matches inside one source character", () => {
    expect(findSearchMatches("ß", "s")).toEqual([[0, 1]]);
  });

  it("finds nothing for blank search text", () => {
    expect(findSearchMatches("abc", " ")).toEqual([]);
    expect(findSearchMatches("abc", "x")).toEqual([]);
  });
});
