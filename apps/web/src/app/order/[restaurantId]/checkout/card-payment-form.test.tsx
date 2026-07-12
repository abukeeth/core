import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockCreatePaymentMethod = vi.fn();
const mockSubmit = vi.fn();
const mockHandleNextAction = vi.fn();

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => <div data-testid="elements-provider">{children}</div>,
  PaymentElement: () => <div data-testid="payment-element">card fields</div>,
  useStripe: () => ({
    createPaymentMethod: mockCreatePaymentMethod,
    handleNextAction: mockHandleNextAction,
  }),
  useElements: () => ({
    submit: mockSubmit,
  }),
}));

import { CardPaymentForm, type CardPaymentFormHandle } from "./card-payment-form";

beforeEach(() => {
  vi.clearAllMocks();
  mockSubmit.mockResolvedValue({});
});

describe("CardPaymentForm", () => {
  it("renders the PaymentElement once Stripe is loaded", async () => {
    render(<CardPaymentForm publicKey="pk_test_123" amountCents={1000} onError={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeInTheDocument());
  });

  it("confirmAndTokenize returns the pm_xxx id on success", async () => {
    mockCreatePaymentMethod.mockResolvedValue({ paymentMethod: { id: "pm_123" } });
    const ref = createRef<CardPaymentFormHandle>();
    const onError = vi.fn();

    render(<CardPaymentForm ref={ref} publicKey="pk_test_123" amountCents={1000} onError={onError} />);
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeInTheDocument());

    const token = await ref.current!.confirmAndTokenize();

    expect(token).toBe("pm_123");
    expect(onError).toHaveBeenCalledWith(null);
  });

  it("confirmAndTokenize surfaces an inline error and returns null on tokenization failure", async () => {
    mockCreatePaymentMethod.mockResolvedValue({ error: { message: "Your card was declined." } });
    const ref = createRef<CardPaymentFormHandle>();
    const onError = vi.fn();

    render(<CardPaymentForm ref={ref} publicKey="pk_test_123" amountCents={1000} onError={onError} />);
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeInTheDocument());

    const token = await ref.current!.confirmAndTokenize();

    expect(token).toBeNull();
    expect(onError).toHaveBeenCalledWith("Your card was declined.");
    expect(mockCreatePaymentMethod).toHaveBeenCalled();
  });

  it("confirmAndTokenize returns null and surfaces an error when elements.submit() itself fails (incomplete card)", async () => {
    mockSubmit.mockResolvedValue({ error: { message: "Your card number is incomplete." } });
    const ref = createRef<CardPaymentFormHandle>();
    const onError = vi.fn();

    render(<CardPaymentForm ref={ref} publicKey="pk_test_123" amountCents={1000} onError={onError} />);
    await waitFor(() => expect(screen.getByTestId("payment-element")).toBeInTheDocument());

    const token = await ref.current!.confirmAndTokenize();

    expect(token).toBeNull();
    expect(onError).toHaveBeenCalledWith("Your card number is incomplete.");
    expect(mockCreatePaymentMethod).not.toHaveBeenCalled();
  });
});
