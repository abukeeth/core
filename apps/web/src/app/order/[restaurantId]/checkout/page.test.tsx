import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ restaurantId: "r1" }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

vi.mock("@/lib/cart-storage", () => ({
  getStoredCartId: vi.fn(() => "cart-1"),
  clearStoredCartId: vi.fn(),
  getOrCreateIdempotencyKey: vi.fn(() => "idem-key-1"),
  clearIdempotencyKey: vi.fn(),
}));

const mockGetCart = vi.fn();
const mockGetCheckoutQuote = vi.fn();
const mockGetPublicPaymentConfig = vi.fn();
const mockPlaceOrder = vi.fn();
const mockConfirmCardPayment = vi.fn();
vi.mock("@/lib/commerce-api", () => ({
  getCart: (...args: unknown[]) => mockGetCart(...args),
  getCheckoutQuote: (...args: unknown[]) => mockGetCheckoutQuote(...args),
  getPublicPaymentConfig: (...args: unknown[]) => mockGetPublicPaymentConfig(...args),
  placeOrder: (...args: unknown[]) => mockPlaceOrder(...args),
  confirmCardPayment: (...args: unknown[]) => mockConfirmCardPayment(...args),
}));

const mockConfirmAndTokenize = vi.fn();
const mockConfirmChallenge = vi.fn();
vi.mock("./card-payment-form", () => ({
  // A forwardRef stub standing in for the real Stripe-backed component —
  // attaches the same imperative handle shape the checkout page calls,
  // so we can control tokenization success/failure per test.
  CardPaymentForm: forwardRef(function CardPaymentFormStub(_props: unknown, ref: React.Ref<unknown>) {
    useImperativeHandle(ref, () => ({
      confirmAndTokenize: mockConfirmAndTokenize,
      confirmChallenge: mockConfirmChallenge,
    }));
    return <div data-testid="card-payment-form-stub" />;
  }),
}));

import CheckoutPage from "./page";

function eligibleQuote(overrides: Record<string, unknown> = {}) {
  return {
    eligible: true,
    subtotalCents: 1000,
    taxCents: 90,
    tipCents: 0,
    deliveryFeeCents: 0,
    serviceFeeCents: 0,
    discountCents: 0,
    totalCents: 1090,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetCart.mockResolvedValue({ cart: { id: "cart-1", items: [] } });
  mockGetCheckoutQuote.mockResolvedValue({ quote: eligibleQuote() });
  mockGetPublicPaymentConfig.mockResolvedValue({ config: { providerType: "STRIPE", publicKey: "pk_test_123" } });
});

describe("CheckoutPage — card tokenization gating (Sprint 07.6 C-1)", () => {
  it("does not call placeOrder for a cash method (tokenization is skipped entirely)", async () => {
    mockGetPublicPaymentConfig.mockResolvedValue({ config: null });
    render(<CheckoutPage />);
    await screen.findByText(/Place order/);

    fireEvent.click(screen.getByText(/Place order/));

    await waitFor(() => expect(mockPlaceOrder).toHaveBeenCalled());
    expect(mockConfirmAndTokenize).not.toHaveBeenCalled();
    const call = mockPlaceOrder.mock.calls[0];
    expect((call[1] as { methodType: string }).methodType).toBe("CASH_ON_DELIVERY");
    expect((call[1] as { methodToken?: string }).methodToken).toBeUndefined();
  });

  it("disables the card option entirely when no payment config is available", async () => {
    mockGetPublicPaymentConfig.mockResolvedValue({ config: null });
    render(<CheckoutPage />);
    await screen.findByText(/Place order/);

    const cardRadio = screen.getByLabelText(/Card \/ Apple Pay \/ Google Pay/, { exact: false });
    expect(cardRadio).toBeDisabled();
  });

  it("blocks placeOrder until tokenization resolves, then submits with the resulting methodToken", async () => {
    mockConfirmAndTokenize.mockResolvedValue("pm_123");
    mockPlaceOrder.mockResolvedValue({ order: { id: "order-1" } });
    render(<CheckoutPage />);
    await screen.findByText(/Place order/);

    fireEvent.click(screen.getByLabelText(/Card \/ Apple Pay \/ Google Pay/, { exact: false }));
    fireEvent.click(screen.getByText(/Place order/));

    await waitFor(() => expect(mockPlaceOrder).toHaveBeenCalled());
    expect(mockConfirmAndTokenize).toHaveBeenCalledTimes(1);
    const call = mockPlaceOrder.mock.calls[0];
    expect((call[1] as { methodToken?: string }).methodToken).toBe("pm_123");
  });

  it("never calls placeOrder when tokenization fails (returns null)", async () => {
    mockConfirmAndTokenize.mockResolvedValue(null);
    render(<CheckoutPage />);
    await screen.findByText(/Place order/);

    fireEvent.click(screen.getByLabelText(/Card \/ Apple Pay \/ Google Pay/, { exact: false }));
    fireEvent.click(screen.getByText(/Place order/));

    await waitFor(() => expect(mockConfirmAndTokenize).toHaveBeenCalledTimes(1));
    expect(mockPlaceOrder).not.toHaveBeenCalled();
  });

  it("completes the 3DS challenge and calls confirmCardPayment when placeOrder returns requiresAction", async () => {
    mockConfirmAndTokenize.mockResolvedValue("pm_123");
    mockPlaceOrder.mockResolvedValue({
      order: { id: "order-1" },
      requiresAction: { clientSecret: "pi_123_secret_abc" },
    });
    mockConfirmChallenge.mockResolvedValue(true);
    mockConfirmCardPayment.mockResolvedValue({ order: { id: "order-1" } });

    render(<CheckoutPage />);
    await screen.findByText(/Place order/);

    fireEvent.click(screen.getByLabelText(/Card \/ Apple Pay \/ Google Pay/, { exact: false }));
    fireEvent.click(screen.getByText(/Place order/));

    await waitFor(() => expect(mockConfirmCardPayment).toHaveBeenCalledWith("cart-1"));
    expect(mockConfirmChallenge).toHaveBeenCalledWith("pi_123_secret_abc");
    expect(mockPush).toHaveBeenCalledWith("/order/confirmation/order-1");
  });
});
