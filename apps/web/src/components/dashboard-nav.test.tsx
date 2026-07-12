import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

import { DashboardNav } from "./dashboard-nav";

describe("DashboardNav — mobile More menu (Sprint 18 Part 7)", () => {
  it("does not show the More sheet until opened", () => {
    render(<DashboardNav />);

    expect(screen.queryByRole("dialog", { name: "More navigation" })).not.toBeInTheDocument();
  });

  it("opens a menu with links otherwise unreachable from the mobile tab bar", () => {
    render(<DashboardNav />);

    fireEvent.click(screen.getByRole("button", { name: "More navigation" }));

    const sheet = within(screen.getByRole("dialog", { name: "More navigation" }));
    expect(sheet.getByRole("link", { name: "Import" })).toHaveAttribute("href", "/dashboard/import");
    expect(sheet.getByRole("link", { name: "AI Website Studio" })).toHaveAttribute("href", "/dashboard/website");
    expect(sheet.getByRole("link", { name: "Launch" })).toHaveAttribute("href", "/dashboard/launch");
    expect(sheet.getByRole("link", { name: "Analytics" })).toHaveAttribute("href", "/dashboard/analytics");
    expect(sheet.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/dashboard/profile");
  });

  it("closes the menu when the backdrop is clicked", () => {
    render(<DashboardNav />);

    fireEvent.click(screen.getByRole("button", { name: "More navigation" }));
    expect(screen.getByRole("dialog", { name: "More navigation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog", { name: "More navigation" })).not.toBeInTheDocument();
  });

  it("closes the menu after selecting a link", () => {
    render(<DashboardNav />);

    fireEvent.click(screen.getByRole("button", { name: "More navigation" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "More navigation" })).getByRole("link", { name: "Import" }));

    expect(screen.queryByRole("dialog", { name: "More navigation" })).not.toBeInTheDocument();
  });
});
