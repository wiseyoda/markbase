// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentThread } from "@/app/repos/[owner]/[repo]/[...path]/comment-thread";
import type { Comment } from "@/lib/comments";

const {
  resolveCommentActionMock,
  unresolveCommentActionMock,
  deleteCommentActionMock,
  restoreCommentActionMock,
} = vi.hoisted(() => ({
  resolveCommentActionMock: vi.fn(),
  unresolveCommentActionMock: vi.fn(),
  deleteCommentActionMock: vi.fn(),
  restoreCommentActionMock: vi.fn(),
}));

vi.mock("@/app/repos/[owner]/[repo]/[...path]/comment-actions", () => ({
  resolveCommentAction: resolveCommentActionMock,
  unresolveCommentAction: unresolveCommentActionMock,
  deleteCommentAction: deleteCommentActionMock,
  restoreCommentAction: restoreCommentActionMock,
}));

const comment: Comment = {
  id: "comment-1",
  file_key: "owner/repo/main/README.md",
  author_id: "2",
  author_name: "Reviewer",
  author_avatar: null,
  quote: null,
  quote_context: null,
  body: "Review feedback",
  parent_id: null,
  resolved_at: null,
  resolved_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  replies: [],
};

describe("CommentThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not announce a deletion that the server denied", async () => {
    const user = userEvent.setup();
    const toast = vi.fn();
    const onUpdate = vi.fn();
    deleteCommentActionMock.mockResolvedValue(false);

    render(
      <CommentThread
        comment={comment}
        repo="owner/repo"
        branch="main"
        filePath="README.md"
        onUpdate={onUpdate}
        toast={toast}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete comment" });
    await user.click(
      screen.getAllByRole("button", { name: "Delete" }).at(-1)!,
    );

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Could not delete this comment.",
        "error",
      ),
    );
    expect(dialog).toBeVisible();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("shows an error instead of leaving rejected resolution unhandled", async () => {
    const user = userEvent.setup();
    const toast = vi.fn();
    resolveCommentActionMock.mockRejectedValue(new Error("Not authorized"));

    render(
      <CommentThread
        comment={comment}
        repo="owner/repo"
        branch="main"
        filePath="README.md"
        onUpdate={vi.fn()}
        toast={toast}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "Could not update this comment.",
        "error",
      ),
    );
  });
});
