// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildDiffInput } from "@/lib/change-digest";

describe("buildDiffInput", () => {
  it("labels both sides with the short sha and emits a unified hunk", () => {
    expect(buildDiffInput("docs/a.md", "c1c1c1c1c1", "p0p0p0p0p0", "a\nb\n", "a\nc\n")).toBe(
      [
        "--- docs/a.md @ p0p0p0p",
        "+++ docs/a.md @ c1c1c1c",
        "@@ -1,2 +1,2 @@",
        " a",
        "-b",
        "+c",
        "",
      ].join("\n"),
    );
  });

  it("marks the old side as a new file when there is no parent", () => {
    const patch = buildDiffInput("docs/a.md", "c1c1c1c1c1", null, "", "hello\n");
    expect(patch.split("\n").slice(0, 4)).toEqual([
      "--- docs/a.md (new file)",
      "+++ docs/a.md @ c1c1c1c",
      "@@ -0,0 +1,1 @@",
      "+hello",
    ]);
  });

  it("keeps non-ASCII and special-character paths readable instead of C-quoting them", () => {
    const patch = buildDiffInput('docs/café "日本".md', "c1c1c1c1c1", "p0p0p0p0p0", "a\n", "b\n");
    const [oldHeader, newHeader] = patch.split("\n");
    expect(oldHeader).toBe('--- docs/café "日本".md @ p0p0p0p');
    expect(newHeader).toBe('+++ docs/café "日本".md @ c1c1c1c');
    expect(patch).not.toMatch(/\\\d{3}/);
  });

  it("preserves the no-newline-at-EOF marker", () => {
    expect(buildDiffInput("a.md", "c1c1c1c", "p0p0p0p", "a", "b")).toContain(
      "\\ No newline at end of file",
    );
  });
});
