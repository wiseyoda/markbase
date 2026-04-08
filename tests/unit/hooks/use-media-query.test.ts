import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile, useIsDesktop, useMediaQuery } from "@/hooks/use-media-query";

interface MockMediaQueryList {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  dispatchEvent: ReturnType<typeof vi.fn>;
}

function createMatchMedia(matches: boolean) {
  const listeners = new Map<string, Set<() => void>>();
  const instances = new Map<string, MockMediaQueryList>();

  const mockMatchMedia = vi.fn((query: string): MockMediaQueryList => {
    // Return a consistent instance per query so subscribe and getSnapshot
    // reference the same object.
    if (instances.has(query)) {
      return instances.get(query)!;
    }

    const mql: MockMediaQueryList = {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === "change") {
          if (!listeners.has(query)) listeners.set(query, new Set());
          listeners.get(query)!.add(cb);
        }
      }),
      removeEventListener: vi.fn((event: string, cb: () => void) => {
        if (event === "change") {
          listeners.get(query)?.delete(cb);
        }
      }),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    instances.set(query, mql);
    return mql;
  });

  function setMatches(query: string, value: boolean) {
    const mql = instances.get(query);
    if (mql) mql.matches = value;
    const cbs = listeners.get(query);
    if (cbs) {
      for (const cb of cbs) cb();
    }
  }

  return { mockMatchMedia, setMatches, instances };
}

describe("useMediaQuery hooks", () => {
  beforeEach(() => {
    // Override the global setup's matchMedia mock — each test installs its own.
    vi.restoreAllMocks();
  });

  describe("useIsMobile", () => {
    it("returns true when viewport <= 639px (matchMedia matches)", () => {
      const { mockMatchMedia } = createMatchMedia(true);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(true);
      expect(mockMatchMedia).toHaveBeenCalledWith("(max-width: 639px)");
    });

    it("returns false when viewport > 639px (matchMedia does not match)", () => {
      const { mockMatchMedia } = createMatchMedia(false);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });
  });

  describe("useIsDesktop", () => {
    it("returns true when viewport >= 1024px (matchMedia matches)", () => {
      const { mockMatchMedia } = createMatchMedia(true);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { result } = renderHook(() => useIsDesktop());

      expect(result.current).toBe(true);
      expect(mockMatchMedia).toHaveBeenCalledWith("(min-width: 1024px)");
    });

    it("returns false when viewport < 1024px (matchMedia does not match)", () => {
      const { mockMatchMedia } = createMatchMedia(false);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { result } = renderHook(() => useIsDesktop());

      expect(result.current).toBe(false);
    });
  });

  describe("event listener re-render", () => {
    it("re-renders when media query changes from non-matching to matching", () => {
      const { mockMatchMedia, setMatches } = createMatchMedia(false);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { result } = renderHook(() =>
        useMediaQuery("(max-width: 639px)"),
      );

      expect(result.current).toBe(false);

      act(() => {
        setMatches("(max-width: 639px)", true);
      });

      expect(result.current).toBe(true);
    });

    it("re-renders when media query changes from matching to non-matching", () => {
      const { mockMatchMedia, setMatches } = createMatchMedia(true);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { result } = renderHook(() =>
        useMediaQuery("(min-width: 1024px)"),
      );

      expect(result.current).toBe(true);

      act(() => {
        setMatches("(min-width: 1024px)", false);
      });

      expect(result.current).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("calls removeEventListener on unmount", () => {
      const { mockMatchMedia, instances } = createMatchMedia(false);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { unmount } = renderHook(() =>
        useMediaQuery("(max-width: 639px)"),
      );

      const mql = instances.get("(max-width: 639px)")!;
      expect(mql.addEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );

      unmount();

      expect(mql.removeEventListener).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );
    });

    it("removes the same callback that was registered", () => {
      const { mockMatchMedia, instances } = createMatchMedia(false);
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        value: mockMatchMedia,
      });

      const { unmount } = renderHook(() =>
        useMediaQuery("(max-width: 639px)"),
      );

      const mql = instances.get("(max-width: 639px)")!;
      const addedCallback = mql.addEventListener.mock.calls.find(
        (c) => c[0] === "change",
      )?.[1] as (() => void) | undefined;

      unmount();

      const removedCallback = mql.removeEventListener.mock.calls.find(
        (c) => c[0] === "change",
      )?.[1] as (() => void) | undefined;

      expect(addedCallback).toBeDefined();
      expect(removedCallback).toBeDefined();
      expect(addedCallback).toBe(removedCallback);
    });
  });
});
