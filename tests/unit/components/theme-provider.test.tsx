// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/components/theme-provider";

/**
 * Node.js 24 exposes a built-in `localStorage` that is a plain object (no
 * getItem/setItem/removeItem/clear methods), which shadows jsdom's Storage
 * implementation. We install a spec-compliant mock so the component under test
 * can call `localStorage.getItem` etc. as it does in the browser.
 */
function createStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

beforeEach(() => {
  const mock = createStorageMock();
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    writable: true,
    configurable: true,
  });
});

/** Helper component that exposes the theme context for assertions. */
function ThemeConsumer() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button data-testid="set-dark" onClick={() => setTheme("dark")}>
        Dark
      </button>
      <button data-testid="set-light" onClick={() => setTheme("light")}>
        Light
      </button>
      <button data-testid="set-system" onClick={() => setTheme("system")}>
        System
      </button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <ThemeProvider>
      <ThemeConsumer />
    </ThemeProvider>,
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("reads theme from localStorage on mount", () => {
    localStorage.setItem("markbase-theme", "dark");

    renderWithProvider();

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("defaults to 'system' when localStorage has no value", () => {
    renderWithProvider();

    expect(screen.getByTestId("theme").textContent).toBe("system");
  });

  it("defaults to 'system' when localStorage has an invalid value", () => {
    localStorage.setItem("markbase-theme", "invalid");

    renderWithProvider();

    expect(screen.getByTestId("theme").textContent).toBe("system");
  });

  it("setTheme('dark') updates localStorage and adds .dark class", () => {
    renderWithProvider();

    act(() => {
      screen.getByTestId("set-dark").click();
    });

    expect(localStorage.getItem("markbase-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByTestId("theme").textContent).toBe("dark");
  });

  it("setTheme('light') updates localStorage and removes .dark class", () => {
    // Start with dark so we can verify removal
    localStorage.setItem("markbase-theme", "dark");
    renderWithProvider();

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      screen.getByTestId("set-light").click();
    });

    expect(localStorage.getItem("markbase-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(screen.getByTestId("theme").textContent).toBe("light");
  });

  it("setTheme('system') removes the localStorage key", () => {
    localStorage.setItem("markbase-theme", "dark");
    renderWithProvider();

    act(() => {
      screen.getByTestId("set-system").click();
    });

    expect(localStorage.getItem("markbase-theme")).toBeNull();
    expect(screen.getByTestId("theme").textContent).toBe("system");
  });

  it("system theme adds .dark when prefers-color-scheme is dark", () => {
    // Override the default matchMedia mock to report dark preference
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    renderWithProvider();

    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("system theme removes .dark when prefers-color-scheme is light", () => {
    // matchMedia already defaults to matches: false in setup
    document.documentElement.classList.add("dark");

    renderWithProvider();

    expect(screen.getByTestId("theme").textContent).toBe("system");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("responds to system preference changes when in system mode", () => {
    let changeHandler: ((e: MediaQueryListEvent) => void) | null = null;

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn().mockImplementation(
          (event: string, handler: (e: MediaQueryListEvent) => void) => {
            if (event === "change") changeHandler = handler;
          },
        ),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    renderWithProvider();

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Simulate the OS switching to dark mode
    act(() => {
      changeHandler?.({ matches: true } as MediaQueryListEvent);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Simulate switching back to light
    act(() => {
      changeHandler?.({ matches: false } as MediaQueryListEvent);
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
