import { describe, expect, it } from "vitest";
import {
  extractToc,
  resolveRelativeMarkdownLink,
  resolveShareMarkdownLink,
  slugifyHeading,
} from "@/lib/markdown";

describe("markdown helpers", () => {
  it("slugifies headings", () => {
    expect(slugifyHeading("Hello, World!")).toBe("hello-world");
  });

  it("resolves repo markdown links", () => {
    expect(
      resolveRelativeMarkdownLink("docs/guide.md", "README.md", "owner", "repo"),
    ).toBe("/repos/owner/repo/docs/guide.md");
    expect(
      resolveRelativeMarkdownLink("./guide.md", "docs/readme.md", "owner", "repo"),
    ).toBe("/repos/owner/repo/docs/guide.md");
    expect(
      resolveRelativeMarkdownLink("../guide.md", "docs/setup/readme.md", "owner", "repo"),
    ).toBe("/repos/owner/repo/docs/guide.md");
    expect(
      resolveRelativeMarkdownLink("https://example.com", "README.md", "owner", "repo"),
    ).toBe("https://example.com");
    expect(
      resolveRelativeMarkdownLink("docs/image.png", "README.md", "owner", "repo"),
    ).toBe("docs/image.png");
  });

  it("resolves share markdown links with folder scoping", () => {
    expect(
      resolveShareMarkdownLink("guide.md", "docs/readme.md", "share-1", "docs"),
    ).toEqual({ url: "/s/share-1/docs/guide.md", inScope: true });
    expect(
      resolveShareMarkdownLink("./guide.md", "docs/readme.md", "share-1", "docs"),
    ).toEqual({ url: "/s/share-1/docs/guide.md", inScope: true });

    expect(
      resolveShareMarkdownLink("../README.md", "docs/readme.md", "share-1", "docs"),
    ).toEqual({ url: "README.md", inScope: false });
    expect(
      resolveShareMarkdownLink("#section", "docs/readme.md", "share-1", "docs"),
    ).toEqual({ url: "#section", inScope: true });
    expect(
      resolveShareMarkdownLink("image.png", "docs/readme.md", "share-1", "docs"),
    ).toEqual({ url: "image.png", inScope: true });
  });

  it("extracts a table of contents", () => {
    expect(
      extractToc("# Title\n## Intro\n### Details\nText"),
    ).toEqual([
      { level: 1, text: "Title", slug: "title" },
      { level: 2, text: "Intro", slug: "intro" },
      { level: 3, text: "Details", slug: "details" },
    ]);
  });
});
