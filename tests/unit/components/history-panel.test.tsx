// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryButton } from "@/app/repos/[owner]/[repo]/[...path]/history-panel";

const { fetchFileHistoryMock, fetchFileAtCommitMock } = vi.hoisted(() => ({
  fetchFileHistoryMock: vi.fn(),
  fetchFileAtCommitMock: vi.fn(),
}));

vi.mock("@/app/repos/[owner]/[repo]/[...path]/history-actions", () => ({
  fetchFileHistory: fetchFileHistoryMock,
  fetchFileAtCommit: fetchFileAtCommitMock,
}));

describe("HistoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a retryable state when history loading fails", async () => {
    const user = userEvent.setup();
    fetchFileHistoryMock.mockRejectedValue(new Error("Not authorized"));

    render(
      <HistoryButton
        owner="owner"
        repo="repo"
        branch="main"
        filePath="README.md"
        currentContent="# Current"
      />,
    );
    await user.click(screen.getByRole("button", { name: "History" }));

    expect(await screen.findByText("Could not load file history.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchFileHistoryMock).toHaveBeenCalledTimes(2));
  });

  it("clears loading and exposes retry guidance when a revision fails", async () => {
    const user = userEvent.setup();
    fetchFileHistoryMock.mockResolvedValue([
      {
        sha: "c1",
        message: "Latest",
        date: "2026-01-01T00:00:00.000Z",
        author: { login: "owner", avatar_url: "" },
      },
    ]);
    fetchFileAtCommitMock.mockRejectedValue(new Error("Not authorized"));

    render(
      <HistoryButton
        owner="owner"
        repo="repo"
        branch="main"
        filePath="README.md"
        currentContent="# Current"
      />,
    );
    await user.click(screen.getByRole("button", { name: "History" }));
    await user.click(await screen.findByRole("button", { name: /Latest/ }));

    expect(
      await screen.findByText(/Could not load this revision.*retry/i),
    ).toBeVisible();
    expect(screen.queryByText("Loading diff...")).not.toBeInTheDocument();
  });
});
