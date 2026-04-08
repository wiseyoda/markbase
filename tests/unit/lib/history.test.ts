import { describe, expect, it } from "vitest";
import { buildDiffLines } from "@/lib/history";

describe("history diff helpers", () => {
  it("builds diff lines", () => {
    expect(buildDiffLines("a\nb\n", "a\nc\n")).toEqual([
      { type: "context", text: "a" },
      { type: "remove", text: "b" },
      { type: "add", text: "c" },
    ]);
  });
});
