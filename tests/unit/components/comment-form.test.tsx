// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewCommentForm } from "@/app/repos/[owner]/[repo]/[...path]/comment-form";

const { addCommentMock } = vi.hoisted(() => ({ addCommentMock: vi.fn() }));

vi.mock("@/app/repos/[owner]/[repo]/[...path]/comment-actions", () => ({
  addComment: addCommentMock,
}));

describe("NewCommentForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("rolls back optimistic state and preserves the draft on failure", async () => {
    const user = userEvent.setup();
    const rollback = vi.fn();
    const toast = vi.fn();
    const onSubmit = vi.fn();
    addCommentMock.mockRejectedValue(new Error("Not authorized"));

    render(
      <NewCommentForm
        quote={null}
        quoteContext={null}
        repo="owner/repo"
        branch="main"
        filePath="README.md"
        parentId={null}
        onOptimistic={() => rollback}
        toast={toast}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    const textbox = screen.getByPlaceholderText("Add a comment...");
    expect(textbox).toHaveAttribute("maxLength", "10000");
    await user.type(textbox, "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Comment" }));

    await waitFor(() => expect(rollback).toHaveBeenCalledOnce());
    expect(textbox).toHaveValue("Keep this draft");
    expect(sessionStorage.getItem("markbase-draft-README.md-root")).toBe(
      "Keep this draft",
    );
    expect(toast).toHaveBeenCalledWith(
      "Could not add comment. Your draft is still here.",
      "error",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
