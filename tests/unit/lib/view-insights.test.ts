// @vitest-environment node

import { describe, expect, it } from "vitest";
import { computeTextChangedLines, resolveDiffSource } from "@/lib/view-insights";

describe("resolveDiffSource", () => {
  it("returns parent when the user has no baseline (first view)", () => {
    expect(resolveDiffSource(null, "current", "parent")).toBe("parent");
  });

  it("returns null on first view when there is no parent commit", () => {
    expect(resolveDiffSource(null, "current", null)).toBeNull();
  });

  it("returns the baseline when it's older than the current commit", () => {
    expect(resolveDiffSource("older", "current", "parent")).toBe("older");
  });

  it("returns null when the user has acknowledged the current commit", () => {
    // The critical case: dismissed at current → banner hidden → highlights empty.
    expect(resolveDiffSource("current", "current", "parent")).toBeNull();
  });
});

describe("computeTextChangedLines", () => {
  it("returns an empty set when baseline and current are identical", () => {
    const lines = computeTextChangedLines("a\nb\nc\n", "a\nb\nc\n");
    expect(lines.size).toBe(0);
  });

  it("flags added lines by their current 1-indexed position", () => {
    const baseline = "a\nb\n";
    const current = "a\nNEW\nb\n";
    const lines = computeTextChangedLines(baseline, current);
    expect([...lines].sort()).toEqual([2]);
  });

  it("flags modified lines", () => {
    const baseline = "a\nb\nc\n";
    const current = "a\nB-EDITED\nc\n";
    const lines = computeTextChangedLines(baseline, current);
    expect([...lines].sort()).toEqual([2]);
  });

  it("flags a run of added lines contiguously", () => {
    const baseline = "a\n";
    const current = "a\nNEW1\nNEW2\nNEW3\n";
    const lines = computeTextChangedLines(baseline, current);
    expect([...lines].sort((x, y) => x - y)).toEqual([2, 3, 4]);
  });

  it("does not advance current-line for removed parts", () => {
    const baseline = "a\nREMOVED\nb\n";
    const current = "a\nb\n";
    const lines = computeTextChangedLines(baseline, current);
    expect(lines.size).toBe(0);
  });

  it("handles empty baseline (all lines added)", () => {
    const lines = computeTextChangedLines("", "a\nb\nc\n");
    expect([...lines].sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });

  it("handles empty current", () => {
    const lines = computeTextChangedLines("a\nb\n", "");
    expect(lines.size).toBe(0);
  });

  it("handles mixed additions, removals, and unchanged blocks with correct line numbers", () => {
    // Baseline lines:  1: a   2: b   3: c   4: d
    // Current  lines:  1: a   2: b   3: NEW 4: d   (c removed, NEW added)
    const baseline = "a\nb\nc\nd\n";
    const current = "a\nb\nNEW\nd\n";
    const lines = computeTextChangedLines(baseline, current);
    // Line 3 in current is the NEW line
    expect(lines.has(3)).toBe(true);
  });

  it("handles lines without trailing newline", () => {
    const baseline = "a\nb";
    const current = "a\nb\nNEW";
    const lines = computeTextChangedLines(baseline, current);
    expect(lines.has(3)).toBe(true);
  });
});
