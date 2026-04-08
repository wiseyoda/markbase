import { describe, expect, it } from "vitest";
import { buildTree } from "@/lib/tree";

describe("buildTree", () => {
  it("returns empty array for no files", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("creates flat file nodes for root-level files", () => {
    const tree = buildTree([
      { path: "README.md", sha: "a" },
      { path: "CHANGELOG.md", sha: "b" },
    ]);

    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe("CHANGELOG.md");
    expect(tree[1].name).toBe("README.md");
    expect(tree.every((n) => n.isFile)).toBe(true);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
  });

  it("creates nested directory nodes", () => {
    const tree = buildTree([
      { path: "docs/guide/intro.md", sha: "a" },
      { path: "docs/guide/setup.md", sha: "b" },
      { path: "docs/api.md", sha: "c" },
    ]);

    expect(tree).toHaveLength(1);
    const docs = tree[0];
    expect(docs.name).toBe("docs");
    expect(docs.isFile).toBe(false);
    expect(docs.path).toBe("docs");

    // docs has: guide/ folder then api.md file
    expect(docs.children).toHaveLength(2);
    const guide = docs.children[0];
    expect(guide.name).toBe("guide");
    expect(guide.isFile).toBe(false);
    expect(guide.children).toHaveLength(2);
    expect(guide.children[0].name).toBe("intro.md");
    expect(guide.children[1].name).toBe("setup.md");

    const api = docs.children[1];
    expect(api.name).toBe("api.md");
    expect(api.isFile).toBe(true);
  });

  it("sorts folders before files, then alphabetically", () => {
    const tree = buildTree([
      { path: "zebra.md", sha: "a" },
      { path: "alpha/one.md", sha: "b" },
      { path: "beta.md", sha: "c" },
      { path: "alpha/two.md", sha: "d" },
    ]);

    // alpha/ folder first, then beta.md, zebra.md
    expect(tree.map((n) => n.name)).toEqual(["alpha", "beta.md", "zebra.md"]);
    expect(tree[0].children.map((n) => n.name)).toEqual(["one.md", "two.md"]);
  });

  it("reuses existing directory nodes for shared paths", () => {
    const tree = buildTree([
      { path: "src/lib/db.ts", sha: "a" },
      { path: "src/lib/auth.ts", sha: "b" },
      { path: "src/app.ts", sha: "c" },
    ]);

    expect(tree).toHaveLength(1);
    const src = tree[0];
    expect(src.children).toHaveLength(2); // lib/ folder + app.ts file
    const lib = src.children[0];
    expect(lib.name).toBe("lib");
    expect(lib.children).toHaveLength(2);
    expect(lib.children.map((n) => n.name)).toEqual(["auth.ts", "db.ts"]);
  });

  it("preserves full file path on leaf nodes", () => {
    const tree = buildTree([
      { path: "a/b/c.md", sha: "x" },
    ]);

    const leaf = tree[0].children[0].children[0];
    expect(leaf.path).toBe("a/b/c.md");
    expect(leaf.isFile).toBe(true);
  });
});
