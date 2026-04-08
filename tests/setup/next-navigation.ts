import { vi } from "vitest";

export const routerMock = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
};

export const redirectMock = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

export const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

let pathname = "/";

export function getMockPathname(): string {
  return pathname;
}

export function setMockPathname(value: string): void {
  pathname = value;
}

export function resetNavigationMocks(): void {
  pathname = "/";
  redirectMock.mockClear();
  notFoundMock.mockClear();

  for (const mockFn of Object.values(routerMock)) {
    mockFn.mockReset();
  }
}
