import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/orders",
}));

import { DashboardDrawer } from "./dashboard-drawer";

describe("DashboardDrawer (Sprint 19B-1)", () => {
  it("does not show the navigation dialog until the hamburger is tapped", () => {
    render(<DashboardDrawer />);

    expect(screen.getByRole("dialog", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toBeInTheDocument();
  });

  it("highlights the active route and lists the expected navigable items", () => {
    render(<DashboardDrawer />);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    const ordersLink = screen.getByRole("link", { name: "Orders" });
    expect(ordersLink).toHaveAttribute("href", "/dashboard/orders");
    expect(ordersLink.className).toContain("bg-[#171512]");

    const dashboardLink = screen.getByRole("link", { name: "Dashboard" });
    expect(dashboardLink.className).not.toContain("bg-[#171512]");

    expect(screen.getByRole("link", { name: "Menu" })).toHaveAttribute("href", "/dashboard/menu");
    expect(screen.getByRole("link", { name: "AI" })).toHaveAttribute("href", "/dashboard/builder");
    expect(screen.getByRole("link", { name: "AI Website Studio" })).toHaveAttribute("href", "/dashboard/website");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/dashboard/restaurant");
  });

  it("renders unmapped items as non-navigating with a Soon badge", () => {
    render(<DashboardDrawer />);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.queryByRole("link", { name: /Customers/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Marketing/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Help/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Soon")).toHaveLength(3);
  });

  it("closes when a link is selected or the backdrop is tapped", () => {
    render(<DashboardDrawer />);
    const trigger = screen.getByRole("button", { name: "Open menu" });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getAllByRole("button", { name: "Close navigation menu" })[0]);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
