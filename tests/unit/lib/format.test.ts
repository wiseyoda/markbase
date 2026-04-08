import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  expiryLabel,
  formatBytes,
  formatDate,
  formatSize,
  readingTime,
  relativeTime,
  timeAgo,
} from "@/lib/format";

describe("format", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-07T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats relative times", () => {
    expect(timeAgo("2026-04-07T11:59:45.000Z")).toBe("just now");
    expect(timeAgo("2026-04-07T11:55:00.000Z")).toBe("5m ago");
    expect(timeAgo("2026-04-07T09:00:00.000Z")).toBe("3h ago");
    expect(timeAgo("2026-04-04T12:00:00.000Z")).toBe("3d ago");
    expect(timeAgo("2026-02-07T12:00:00.000Z")).toBe("1mo ago");
    expect(timeAgo("2024-04-07T12:00:00.000Z")).toBe("2y ago");
  });

  it("formats compact relative times", () => {
    expect(relativeTime("2026-04-07T11:59:45.000Z")).toBe("now");
    expect(relativeTime("2026-04-07T11:50:00.000Z")).toBe("10m");
    expect(relativeTime("2026-04-07T06:00:00.000Z")).toBe("6h");
    expect(relativeTime("2026-04-05T12:00:00.000Z")).toBe("2d");
  });

  it("formats dates across thresholds", () => {
    expect(formatDate("2026-04-07T11:30:00.000Z")).toBe("just now");
    expect(formatDate("2026-04-07T08:00:00.000Z")).toBe("4h ago");
    expect(formatDate("2026-04-04T12:00:00.000Z")).toBe("3d ago");
    expect(formatDate("2026-03-01T12:00:00.000Z")).toBe("Mar 1");
    expect(formatDate("2025-03-01T12:00:00.000Z")).toBe("Mar 1, 2025");
  });

  it("formats expiry labels", () => {
    expect(expiryLabel(null)).toBe("Never");
    expect(expiryLabel("2026-04-07T11:59:00.000Z")).toBe("Expired");
    expect(expiryLabel("2026-04-07T12:10:00.000Z")).toBe("< 1h left");
    expect(expiryLabel("2026-04-07T15:00:00.000Z")).toBe("3h left");
    expect(expiryLabel("2026-04-10T12:00:00.000Z")).toBe("3d left");
  });

  it("formats byte and size units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");

    expect(formatSize(512)).toBe("512 KB");
    expect(formatSize(1024)).toBe("1.0 MB");
    expect(formatSize(1024 * 1024)).toBe("1.0 GB");
  });

  it("estimates reading time", () => {
    expect(readingTime("one two three")).toBe("1 min read");
    expect(readingTime(new Array(461).fill("word").join(" "))).toBe(
      "3 min read",
    );
  });
});
