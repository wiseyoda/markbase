import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../helpers/render";
import DevicePage from "@/app/mcp/device/page";
import DeviceDonePage from "@/app/mcp/device/done/page";

describe("MCP device pages", () => {
  it("prefills the user code from the query string", async () => {
    renderWithProviders(
      await DevicePage({ searchParams: Promise.resolve({ user_code: "BCDF-GHJK" }) }),
    );
    const input = screen.getByLabelText("Device code") as HTMLInputElement;
    expect(input.value).toBe("BCDF-GHJK");
    expect(input.form?.getAttribute("action")).toBe("/api/mcp/device/verify");
    expect(input.form?.getAttribute("method")).toBe("get");
  });

  it("renders an empty form without a code and takes the first repeated value", async () => {
    const { unmount } = renderWithProviders(
      await DevicePage({ searchParams: Promise.resolve({}) }),
    );
    expect((screen.getByLabelText("Device code") as HTMLInputElement).value).toBe("");
    unmount();

    renderWithProviders(
      await DevicePage({
        searchParams: Promise.resolve({ user_code: ["BCDF-GHJK", "other"] }),
      }),
    );
    expect((screen.getByLabelText("Device code") as HTMLInputElement).value).toBe(
      "BCDF-GHJK",
    );
  });

  it("confirms authorization or explains the error", async () => {
    const { unmount } = renderWithProviders(
      await DeviceDonePage({ searchParams: Promise.resolve({}) }),
    );
    expect(screen.getByRole("heading", { name: "Device authorized" })).toBeInTheDocument();
    expect(screen.getByText(/return to your terminal/i)).toBeInTheDocument();
    unmount();

    const expired = renderWithProviders(
      await DeviceDonePage({ searchParams: Promise.resolve({ error: "expired" }) }),
    );
    expect(screen.getByText(/expired or was already used/i)).toBeInTheDocument();
    expired.unmount();

    renderWithProviders(
      await DeviceDonePage({ searchParams: Promise.resolve({ error: ["weird"] }) }),
    );
    expect(screen.getByText(/Device authorization failed/i)).toBeInTheDocument();
  });
});
