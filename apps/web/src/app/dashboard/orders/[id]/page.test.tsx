import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "order-1" }),
  usePathname: () => "/dashboard/orders/order-1",
}));

const mockGetOwnOrder = vi.fn();
const mockListDriverCandidates = vi.fn();
const mockAssignDriver = vi.fn();
vi.mock("@/lib/owner-commerce-api", () => ({
  getOwnOrder: (...args: unknown[]) => mockGetOwnOrder(...args),
  listDriverCandidates: (...args: unknown[]) => mockListDriverCandidates(...args),
  assignDriver: (...args: unknown[]) => mockAssignDriver(...args),
  cancelOrder: vi.fn(),
  completeOrder: vi.fn(),
  markOutForDelivery: vi.fn(),
  markPaidCash: vi.fn(),
  markReady: vi.fn(),
  refundOrder: vi.fn(),
  startPreparing: vi.fn(),
}));

import OrderDetailPage from "./page";

function baseOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNumber: 42,
    status: "CONFIRMED",
    paymentStatus: "PAID",
    fulfillmentType: "DELIVERY",
    source: "ONLINE",
    subtotalCents: 1000,
    taxCents: 0,
    tipCents: 0,
    deliveryFeeCents: 0,
    serviceFeeCents: 0,
    discountCents: 0,
    totalCents: 1000,
    placedAt: new Date().toISOString(),
    tableId: null,
    items: [],
    payment: null,
    fulfillment: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListDriverCandidates.mockResolvedValue({ drivers: [] });
});

describe("OrderDetailPage — assign-driver control (Sprint 09)", () => {
  it("does not show a driver section when the fulfillment method isn't RESTAURANT_DRIVER", async () => {
    mockGetOwnOrder.mockResolvedValue({ order: baseOrder({ fulfillment: null }) });

    render(<OrderDetailPage />);
    await screen.findByText("Order #42");

    expect(screen.queryByRole("heading", { name: "Driver" })).not.toBeInTheDocument();
    expect(mockListDriverCandidates).not.toHaveBeenCalled();
  });

  it("shows an unassigned state and lets staff assign an eligible driver", async () => {
    mockGetOwnOrder.mockResolvedValue({
      order: baseOrder({ fulfillment: { id: "f1", status: "UNASSIGNED", method: "RESTAURANT_DRIVER", driverAssignment: null } }),
    });
    mockListDriverCandidates.mockResolvedValue({
      drivers: [{ id: "u1", name: "Alice", email: "alice@example.com", activeAssignmentCount: 0 }],
    });
    mockAssignDriver.mockResolvedValue({ assignment: { id: "da1", status: "OFFERED" } });

    render(<OrderDetailPage />);
    await screen.findByRole("heading", { name: "Driver" });
    await screen.findByText("Alice");

    expect(screen.getByText("No driver assigned yet.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "u1" } });
    fireEvent.click(screen.getByText("Assign driver"));

    await waitFor(() => expect(mockAssignDriver).toHaveBeenCalledWith("f1", "u1"));
  });

  it("shows the currently-assigned driver's name and status, offering reassign", async () => {
    mockGetOwnOrder.mockResolvedValue({
      order: baseOrder({
        fulfillment: {
          id: "f1",
          status: "ASSIGNED",
          method: "RESTAURANT_DRIVER",
          driverAssignment: { id: "da1", fulfillmentId: "f1", driverId: "u1", status: "OFFERED", currentLat: null, currentLng: null },
        },
      }),
    });
    mockListDriverCandidates.mockResolvedValue({
      drivers: [{ id: "u1", name: "Alice", email: "alice@example.com", activeAssignmentCount: 1 }],
    });

    render(<OrderDetailPage />);
    await screen.findByRole("heading", { name: "Driver" });
    await screen.findByText("Alice");

    expect(screen.getByText(/Currently assigned to/)).toBeInTheDocument();
    expect(screen.getByText(/status: OFFERED/)).toBeInTheDocument();
    expect(screen.getByText("Reassign driver")).toBeInTheDocument();
  });
});
