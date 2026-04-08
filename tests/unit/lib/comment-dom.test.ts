import { describe, expect, it, vi } from "vitest";
import type { Comment } from "@/lib/comments";
import {
  buildSelectionPopupState,
  calculateCommentPositions,
  clearCommentHighlights,
  getTextOffset,
  highlightText,
  withRetry,
} from "@/lib/comment-dom";

function makeComment(overrides: Partial<Comment>): Comment {
  return {
    id: "comment-1",
    file_key: "repo/main/README.md",
    author_id: "1",
    author_name: "Owner",
    author_avatar: null,
    quote: "Detail",
    quote_context: "0",
    body: "Looks good",
    parent_id: null,
    resolved_at: null,
    resolved_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    replies: [],
    ...overrides,
  };
}

describe("comment DOM helpers", () => {
  it("retries async work", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("retry"))
      .mockResolvedValue("ok");

    const promise = withRetry(fn, 1, 10);
    await vi.advanceTimersByTimeAsync(10);

    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears existing highlights", () => {
    document.body.innerHTML = `<article id="root">Hello <mark class="comment-highlight">world</mark></article>`;
    const root = document.getElementById("root") as HTMLElement;

    clearCommentHighlights(root);

    expect(root.querySelector(".comment-highlight")).toBeNull();
    expect(root.textContent).toBe("Hello world");
  });

  it("computes text offsets", () => {
    document.body.innerHTML = `<article id="root">Hello <span>world</span></article>`;
    const root = document.getElementById("root") as HTMLElement;
    const textNode = root.querySelector("span")?.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.setEnd(textNode, 5);

    expect(getTextOffset(root, range)).toBe(8);
  });

  it("returns the accumulated offset when the start container is outside the root", () => {
    document.body.innerHTML = `<article id="root">Hello world</article><span id="outside">Outside</span>`;
    const root = document.getElementById("root") as HTMLElement;
    const outside = document.getElementById("outside")?.firstChild as Text;
    const range = document.createRange();
    range.setStart(outside, 1);
    range.setEnd(outside, 3);

    expect(getTextOffset(root, range)).toBe("Hello world".length);
  });

  it("highlights matching text", () => {
    document.body.innerHTML = `<article id="root"><p>Hello\nworld</p><p>Detail</p></article>`;
    const root = document.getElementById("root") as HTMLElement;

    highlightText(root, "Detail", "comment-1", 11);

    const mark = root.querySelector("[data-comment-id='comment-1']");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("Detail");
  });

  it("falls back to stripped whitespace matches and leaves missing text alone", () => {
    document.body.innerHTML = `<article id="root"><p>Hello</p><p>world</p></article>`;
    const root = document.getElementById("root") as HTMLElement;

    highlightText(root, "Hello\nworld", "comment-2", 0);
    expect(root.querySelector("[data-comment-id='comment-2']")).not.toBeNull();

    document.body.innerHTML = `<article id="root-again"><p>Hello</p><p>world</p></article>`;
    const rootAgain = document.getElementById("root-again") as HTMLElement;
    highlightText(rootAgain, "Hello\nworld", "comment-4");
    expect(rootAgain.querySelector("[data-comment-id='comment-4']")).not.toBeNull();

    const before = rootAgain.innerHTML;
    highlightText(rootAgain, "Missing", "comment-3");
    expect(rootAgain.innerHTML).toBe(before);
  });

  it("builds selection popup state for valid selections", () => {
    document.body.innerHTML = `<article id="root">Hello Detail text</article>`;
    const root = document.getElementById("root") as HTMLElement;
    const textNode = root.firstChild as Text;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 12);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(buildSelectionPopupState(root, selection!, 100, 200)).toEqual({
      x: 100,
      y: 160,
      text: "Detail",
      context: "Hello Detail text",
      offset: 6,
    });
  });

  it("returns null for invalid selections", () => {
    document.body.innerHTML = `<article id="root">Hi</article>`;
    const root = document.getElementById("root") as HTMLElement;
    const selection = window.getSelection();
    selection?.removeAllRanges();

    expect(buildSelectionPopupState(root, selection!, 0, 0)).toBeNull();
  });

  it("calculates comment positions from highlighted text", () => {
    document.body.innerHTML = `
      <div id="scroll">
        <article id="article">
          <p><mark data-comment-id="comment-1">Detail</mark></p>
        </article>
      </div>
    `;

    const scroll = document.getElementById("scroll") as HTMLElement;
    const article = document.getElementById("article") as HTMLElement;
    const mark = article.querySelector("mark") as HTMLElement;

    // getBoundingClientRect-based positioning
    scroll.getBoundingClientRect = () =>
      ({ top: 100, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    mark.getBoundingClientRect = () =>
      ({ top: 142, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => {} }) as DOMRect;
    Object.defineProperty(scroll, "scrollTop", { configurable: true, value: 0 });

    expect(
      calculateCommentPositions(scroll.querySelector("article") as HTMLElement, scroll, [
        makeComment({ id: "comment-1" }),
      ]),
    ).toEqual({ "comment-1": 42 });
  });

  it("ignores comments without quotes or matching highlights", () => {
    document.body.innerHTML = `
      <div id="scroll">
        <article id="article">
          <p>No highlight</p>
        </article>
      </div>
    `;

    const scroll = document.getElementById("scroll") as HTMLElement;
    const article = document.getElementById("article") as HTMLElement;

    expect(
      calculateCommentPositions(article, scroll, [
        makeComment({ id: "comment-2", quote: null }),
        makeComment({ id: "comment-3", quote: "Missing" }),
      ]),
    ).toEqual({});
  });
});
