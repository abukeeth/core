import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/kitchen",
}));

vi.mock("@/lib/owner-commerce-api", () => ({
  listOwnOrders: vi.fn(),
  startPreparing: vi.fn(),
  markReady: vi.fn(),
  markOutForDelivery: vi.fn(),
  completeOrder: vi.fn(),
}));

import { listOwnOrders, type OwnerOrder } from "@/lib/owner-commerce-api";
import KitchenQueuePage from "./page";

const mockList = vi.mocked(listOwnOrders);

function order(id: string, orderNumber: number): OwnerOrder {
  return {
    id,
    orderNumber,
    status: "CONFIRMED",
    fulfillmentType: "PICKUP",
    source: "WEB",
    placedAt: new Date().toISOString(),
    tableId: null,
  } as OwnerOrder;
}

// The page fetches once per queue status and flat-maps the results; return
// each order only for its own status so nothing is duplicated across calls.
function respondWith(orders: OwnerOrder[]) {
  mockList.mockImplementation((params?: { status?: string }) =>
    Promise.resolve({ orders: orders.filter((o) => o.status === params?.status), total: orders.length }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Keep the AudioContext path (playAlertBeep) out of the test; jsdom has no
  // EventSource, so the SSE effect self-disables — the fallback fetch is what
  // drives these assertions.
  window.localStorage.setItem("ordervora-kitchen-sound-enabled", "false");
});

describe("KitchenQueuePage — new-order flash", () => {
  it("does not flash an order already present on first load", async () => {
    respondWith([order("a", 1001)]);

    render(<KitchenQueuePage />);

    await screen.findByRole("button", { name: "Start preparing" });
    expect(screen.queryAllByText("●")).toHaveLength(0);
  });

  it("flashes exactly the order that appears after the queue has been observed", async () => {
    respondWith([order("a", 1001)]);
    render(<KitchenQueuePage />);
    await screen.findByRole("button", { name: "Start preparing" });

    // A second order arrives; a manual Refresh triggers the next fetch.
    respondWith([order("a", 1001), order("b", 1002)]);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(screen.getAllByRole("button", { name: "Start preparing" })).toHaveLength(2));
    // Only the newly-arrived card carries the flash marker.
    expect(screen.queryAllByText("●")).toHaveLength(1);
  });
});
