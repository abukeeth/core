"use client";

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { forwardRef, useImperativeHandle, useMemo, useState } from "react";

export interface CardPaymentFormHandle {
  /** Tokenizes the entered card details, returning a pm_xxx id usable as
   * PlaceOrderInput.methodToken, or null (with an inline error already
   * shown) if tokenization fails. Never lets the caller proceed to
   * placeOrder without a token (Sprint 07.6 C-1). */
  confirmAndTokenize(): Promise<string | null>;
  /** Completes a pending 3DS/SCA challenge for a PaymentIntent the server
   * already confirmed (authorizeOrderPayment's requiresAction result) —
   * the intent only needs its next action (e.g. the 3DS iframe) resolved,
   * not a fresh payment-method submission (Sprint 07.6 C-6). */
  confirmChallenge(clientSecret: string): Promise<boolean>;
}

interface InnerFormProps {
  onError: (message: string | null) => void;
}

const InnerForm = forwardRef<CardPaymentFormHandle, InnerFormProps>(function InnerForm({ onError }, ref) {
  const stripe = useStripe();
  const elements = useElements();

  useImperativeHandle(ref, () => ({
    async confirmAndTokenize() {
      if (!stripe || !elements) {
        onError("Payment form is still loading — please try again in a moment.");
        return null;
      }
      const { error: submitError } = await elements.submit();
      if (submitError) {
        onError(submitError.message ?? "Please check your card details.");
        return null;
      }
      const { error, paymentMethod } = await stripe.createPaymentMethod({ elements });
      if (error || !paymentMethod) {
        onError(error?.message ?? "Could not process your card details.");
        return null;
      }
      onError(null);
      return paymentMethod.id;
    },

    async confirmChallenge(clientSecret: string) {
      if (!stripe) {
        onError("Payment form is still loading — please try again in a moment.");
        return false;
      }
      const { error, paymentIntent } = await stripe.handleNextAction({ clientSecret });
      if (error) {
        onError(error.message ?? "Could not complete the required verification step.");
        return false;
      }
      return paymentIntent?.status === "requires_capture" || paymentIntent?.status === "succeeded";
    },
  }));

  return <PaymentElement />;
});

export interface CardPaymentFormProps {
  publicKey: string;
  /** The order's current total — Stripe's "deferred" Payment Element (no
   * clientSecret yet, since no PaymentIntent exists until authorizeOrderPayment
   * runs server-side) needs an amount/currency to render the right payment
   * method options. */
  amountCents: number;
  currency?: string;
  onError: (message: string | null) => void;
}

/**
 * Wraps Stripe's <Elements> provider around a <PaymentElement>, exposing an
 * imperative confirmAndTokenize() the checkout page calls right before
 * placeOrder (Sprint 07.6 C-1). loadStripe is memoized per publicKey so
 * remounts don't re-fetch Stripe.js.
 */
export const CardPaymentForm = forwardRef<CardPaymentFormHandle, CardPaymentFormProps>(function CardPaymentForm(
  { publicKey, amountCents, currency = "usd", onError },
  ref,
) {
  const [stripePromise] = useState<Promise<Stripe | null>>(() => loadStripe(publicKey));
  const options = useMemo(
    () => ({ mode: "payment" as const, amount: Math.max(amountCents, 1), currency }),
    [amountCents, currency],
  );

  return (
    <Elements stripe={stripePromise} options={options}>
      <InnerForm ref={ref} onError={onError} />
    </Elements>
  );
});
