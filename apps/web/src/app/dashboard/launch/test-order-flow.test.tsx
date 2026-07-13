import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/launch/test-order",
}));

import { TestOrderFlow } from "./test-order-flow";
import type { Restaurant } from "@/lib/api";

const restaurant = { id: "rest-real-id-456", name: "Joe's Diner" } as Restaurant;

describe("TestOrderFlow — §K: test order URL resolves to the real current restaurant", () => {
  it("opens the real restaurant's ordering page, never a hardcoded slug or placeholder domain", () => {
    render(<TestOrderFlow restaurant={restaurant} />);

    const link = screen.getByRole("link", { name: "Open my ordering page" });
    expect(link).toHaveAttribute("href", `${window.location.origin}/order/${restaurant.id}`);
  });
});
