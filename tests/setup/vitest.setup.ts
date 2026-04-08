import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import {
  getMockPathname,
  notFoundMock,
  redirectMock,
  resetNavigationMocks,
  routerMock,
} from "./next-navigation";

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => getMockPathname(),
  useSearchParams: () => new URLSearchParams(),
  redirect: redirectMock,
  notFound: notFoundMock,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string | { toString(): string };
    children: React.ReactNode;
  }) =>
    React.createElement(
      "a",
      { href: typeof href === "string" ? href : href.toString(), ...props },
      children,
    ),
}));

vi.mock("next/script", () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ className: "", variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ className: "", variable: "--font-geist-mono" }),
}));

beforeEach(() => {
  resetNavigationMocks();

  if (typeof window !== "undefined") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    Object.defineProperty(window, "scrollTo", {
      writable: true,
      value: vi.fn(),
    });

    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    globalThis.IntersectionObserver = class IntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds = [];
    };
  }

  if (typeof navigator !== "undefined") {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
