import { describe, expect, it } from "vitest";
import { fitLabel, labelInitials, labelPieces, shortestWrap, wrapLabel } from "./fit-label";

// 7 px per character: easy to reason about.
const measure = (text: string) => text.length * 7;
const box = (weeks: number, maxHeight = 112) => ({ width: weeks * 32 - 2, lineHeight: 16, maxHeight });

describe("labelPieces", () => {
  it("keeps a lone dash with the word before it and breaks after a hyphen", () => {
    expect(labelPieces("Seriespill – Høst").map((piece) => piece.text)).toEqual(["Seriespill –", "Høst"]);
    expect(labelPieces("Off-season development")).toEqual([
      { text: "Off-", space: false },
      { text: "season", space: false },
      { text: "development", space: true },
    ]);
  });
});

describe("wrapLabel", () => {
  it("breaks between words and after hyphens, and refuses a piece wider than the room", () => {
    expect(wrapLabel("Christmas break", 70, measure)).toEqual(["Christmas", "break"]);
    expect(wrapLabel("Pre-season", 50, measure)).toEqual(["Pre-", "season"]);
    expect(wrapLabel("Qualification", 70, measure)).toBeNull();
  });
});

describe("shortestWrap", () => {
  it("finds the shortest line that keeps to the number of lines", () => {
    expect(shortestWrap("Qualification window", 1, measure)).toBe(140);
    expect(shortestWrap("Qualification window", 2, measure)).toBe(91);
    expect(shortestWrap("Return before restart", 3, measure)).toBe(49);
  });
});

describe("labelInitials", () => {
  it("takes the first letter of each word, skipping dashes", () => {
    expect(labelInitials("Seriespill – Høst")).toBe("SH");
    expect(labelInitials("Return before restart")).toBe("RBR");
  });
});

describe("fitLabel", () => {
  it("keeps a title that fits on one line", () => {
    expect(fitLabel("Run-in", box(5), measure)).toEqual({ mode: "line", text: "Run-in" });
  });

  it("wraps a title across the bar, at a hyphen too", () => {
    expect(fitLabel("Seriespill – Høst", box(4), measure)).toEqual({ mode: "wrap", text: "Seriespill – Høst" });
    expect(fitLabel("Pre-season", box(2), measure)).toEqual({ mode: "wrap", text: "Pre-season" });
  });

  it("sets a narrow bar's title vertically, over as many lines as fit, as short as it can be", () => {
    // 3 weeks: 94 px wide, room for 5 lines; “Qualification” alone is 91 px.
    expect(fitLabel("Qualification window", box(3), measure)).toEqual({ mode: "vertical", text: "Qualification window", length: 91 });
  });

  it("keeps a vertical title within the most it may grow the lane", () => {
    expect(fitLabel("Qualification window", box(3, 90), measure).mode).not.toBe("vertical");
  });

  it("falls back to the first word, across and then vertically, before initials", () => {
    // 1 week: 30 px wide, one vertical line of at most 100 px.
    expect(fitLabel("Return before restart", box(1), measure)).toEqual({ mode: "vertical", text: "Return…", length: 49 });
    expect(fitLabel("Return before restart", box(1, 50), measure)).toEqual({ mode: "short", text: "RBR" });
    expect(fitLabel("Go hard", box(1, 30), measure)).toEqual({ mode: "short", text: "Go…" });
  });

  it("leaves an empty title alone", () => {
    expect(fitLabel("  ", box(1), measure)).toEqual({ mode: "line", text: "" });
  });
});
