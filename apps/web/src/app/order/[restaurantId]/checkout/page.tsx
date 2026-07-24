"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  confirmCardPayment,
  getCart,
  getCheckoutQuote,
  getPublicPaymentConfig,
  placeOrder,
  type Cart,
  type CheckoutQuote,
  type PaymentMethodType,
  type PublicPaymentConfig,
} from "@/lib/commerce-api";
import { clearIdempotencyKey, clearStoredCartId, getOrCreateIdempotencyKey, getStoredCartId } from "@/lib/cart-storage";
import { CardPaymentForm, type CardPaymentFormHandle } from "./card-payment-form";

/* Checkout — Customer Storefront V2 "Appetite Premium". All logic (guest
 * details, tip, payment method + Stripe card/wallet, quote summary, place
 * order, 3DS/SCA challenge, idempotency) is unchanged; only presentation was
 * rebuilt to match the storefront. */

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

const CARD_METHOD_TYPE: PaymentMethodType = "VISA";

const PAYMENT_METHODS: { value: PaymentMethodType; label: string }[] = [
  { value: "CASH_ON_DELIVERY", label: "Cash on delivery" },
  { value: "CASH_AT_PICKUP", label: "Cash at pickup" },
  // A single card/wallet option — Stripe's PaymentElement surfaces
  // Apple Pay/Google Pay automatically alongside card entry when the
  // customer's browser/device supports them, so one Element covers all of
  // Sprint 07.6 C-1's card + wallet scope without a second integration.
  { value: CARD_METHOD_TYPE, label: "Card / Apple Pay / Google Pay" },
];

const FIELD = "w-full rounded-[12px] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition focus:border-ink placeholder:text-ink-muted";
const CARD = "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5";
const LABEL = "font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted";

export default function CheckoutPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = params.restaurantId;
  const router = useRouter();

  const [cartId] = useState<string | null>(() => getStoredCartId(restaurantId));
  const [cart, setCart] = useState<Cart | null>(null);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [tipCents, setTipCents] = useState(0);
  const [methodType, setMethodType] = useState<PaymentMethodType>("CASH_ON_DELIVERY");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<PublicPaymentConfig | null>(null);
  const cardFormRef = useRef<CardPaymentFormHandle>(null);

  useEffect(() => {
    if (!cartId) {
      router.replace(`/order/${restaurantId}`);
    }
  }, [cartId, restaurantId, router]);

  useEffect(() => {
    if (!cartId) return;
    let cancelled = false;
    async function load() {
      try {
        const { cart: loadedCart } = await getCart(cartId!);
        if (cancelled) return;
        setCart(loadedCart);
        const { quote: loadedQuote } = await getCheckoutQuote(cartId!, tipCents);
        if (cancelled) return;
        setQuote(loadedQuote);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load checkout");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cartId, tipCents]);

  useEffect(() => {
    let cancelled = false;
    getPublicPaymentConfig(restaurantId)
      .then(({ config }) => {
        if (!cancelled) setPaymentConfig(config);
      })
      .catch(() => {
        // Card checkout simply stays unavailable — cash methods are unaffected.
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  async function handlePlaceOrder(event: React.FormEvent) {
    event.preventDefault();
    if (!cartId) return;
    setSubmitting(true);
    setError(null);
    try {
      let methodToken: string | undefined;
      if (methodType === CARD_METHOD_TYPE) {
        if (!paymentConfig) {
          setError("Card payments are not available for this restaurant yet.");
          return;
        }
        // Tokenization must resolve before placeOrder is ever called — a
        // failed/incomplete card entry blocks submission here, client-side,
        // before any network call to the checkout endpoint (Sprint 07.6 C-1).
        const token = await cardFormRef.current?.confirmAndTokenize();
        if (!token) return;
        methodToken = token;
      }

      const idempotencyKey = getOrCreateIdempotencyKey();
      const { order, requiresAction } = await placeOrder(
        cartId,
        {
          tipCents,
          methodType,
          methodToken,
          guestEmail: guestEmail || undefined,
          guestName: guestName || undefined,
          guestPhone: guestPhone || undefined,
        },
        idempotencyKey,
      );

      if (requiresAction) {
        // 3DS/SCA challenge (Sprint 07.6 C-6) — complete it client-side,
        // then resume the same order via the confirm-payment endpoint.
        const completed = await cardFormRef.current?.confirmChallenge(requiresAction.clientSecret);
        if (!completed) {
          setError("Additional verification was not completed. Please try again.");
          return;
        }
        const { order: confirmedOrder } = await confirmCardPayment(cartId);
        clearIdempotencyKey();
        clearStoredCartId(restaurantId);
        router.push(`/order/confirmation/${confirmedOrder.id}`);
        return;
      }

      clearIdempotencyKey();
      clearStoredCartId(restaurantId);
      router.push(`/order/confirmation/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  }

  if (!cart || !quote) {
    return <div className="flex flex-1 items-center justify-center bg-canvas p-8 text-sm text-ink-secondary">{error ?? "Loading checkout…"}</div>;
  }

  return (
    <div className="relative flex flex-1 flex-col bg-canvas text-ink">
      <form onSubmit={handlePlaceOrder} className="mx-auto flex w-full max-w-[460px] flex-1 flex-col">

        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 py-3.5 backdrop-blur-xl">
          <h1 className="font-display text-[19px] font-bold tracking-[-0.01em]">Checkout</h1>
          <Link href={`/order/${restaurantId}/cart`} className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-secondary">← Cart</Link>
        </header>

        <div className="flex flex-col gap-4 px-4 pb-40 pt-4">
          {error && <div className="rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

          {!quote.eligible && (
            <div className="rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">
              {quote.reason ?? "This order is not currently eligible for checkout."}
            </div>
          )}

          {/* Guest details */}
          <div className={CARD}>
            <span className={LABEL}>Your details</span>
            <input type="text" placeholder="Full name" value={guestName} onChange={(e) => setGuestName(e.target.value)} className={FIELD} />
            <input type="email" placeholder="Email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} className={FIELD} />
            <input type="tel" placeholder="Phone" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className={FIELD} />
          </div>

          {/* Payment */}
          <div className={CARD}>
            <span className={LABEL}>Payment</span>
            <div className="flex flex-col gap-2">
              {PAYMENT_METHODS.map((method) => {
                const disabled = method.value === CARD_METHOD_TYPE && !paymentConfig;
                const selected = methodType === method.value;
                return (
                  <label key={method.value}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-[12px] border px-3.5 py-3 text-sm transition ${
                      selected ? "border-ink bg-subtle" : "border-line"
                    } ${disabled ? "opacity-50" : ""}`}>
                    <span className="font-medium text-ink">
                      {method.label}
                      {disabled && <span className="text-ink-muted"> · not available</span>}
                    </span>
                    <input type="radio" name="methodType" className="sr-only" checked={selected}
                      onChange={() => setMethodType(method.value)} disabled={disabled} />
                    <span className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-ink bg-ink text-canvas" : "border-line"}`}>
                      {selected ? <span className="size-2 rounded-full bg-canvas" /> : null}
                    </span>
                  </label>
                );
              })}
            </div>
            {methodType === CARD_METHOD_TYPE && paymentConfig && (
              <div className="mt-1 rounded-[12px] border border-line p-3.5">
                <CardPaymentForm ref={cardFormRef} publicKey={paymentConfig.publicKey} amountCents={quote.totalCents} onError={setCardError} />
                {cardError && <p className="mt-2 text-sm text-danger">{cardError}</p>}
              </div>
            )}
          </div>

          {/* Tip */}
          <div className={CARD}>
            <span className={LABEL}>Add a tip</span>
            <div className="flex gap-2">
              {[0, 200, 400, 600].map((amount) => {
                const active = tipCents === amount;
                return (
                  <button key={amount} type="button" onClick={() => setTipCents(amount)}
                    aria-pressed={active}
                    className={`flex-1 rounded-full py-2.5 text-[13px] font-semibold transition ${active ? "bg-ink text-canvas" : "border border-line text-ink-secondary"}`}>
                    {amount === 0 ? "No tip" : `$${formatPrice(amount)}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Summary */}
          <div className={`${CARD} gap-2.5`}>
            <span className={LABEL}>Order summary</span>
            <Row label="Subtotal" value={`$${formatPrice(quote.subtotalCents)}`} />
            <Row label="Tax" value={`$${formatPrice(quote.taxCents)}`} />
            {quote.deliveryFeeCents > 0 && <Row label="Delivery fee" value={`$${formatPrice(quote.deliveryFeeCents)}`} />}
            {quote.serviceFeeCents > 0 && <Row label="Service fee" value={`$${formatPrice(quote.serviceFeeCents)}`} />}
            {quote.discountCents > 0 && <Row label="Discount" value={`−$${formatPrice(quote.discountCents)}`} positive />}
            <Row label="Tip" value={`$${formatPrice(quote.tipCents)}`} />
            <div className="mt-1 flex items-center justify-between border-t border-line pt-3">
              <span className="font-display text-base font-bold">Total</span>
              <span className="font-display text-xl font-extrabold tabular-nums">${formatPrice(quote.totalCents)}</span>
            </div>
          </div>
        </div>
      </form>

      {/* Sticky place order */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-6"
        style={{ background: "linear-gradient(transparent, var(--ov-canvas) 32%)" }}>
        <button type="button" onClick={handlePlaceOrder} disabled={submitting || !quote.eligible}
          className="pointer-events-auto mx-auto flex w-full max-w-[460px] items-center justify-center gap-2 rounded-full bg-ink px-5 py-4 text-[15px] font-semibold text-canvas shadow-[0_14px_34px_-12px_rgba(30,20,6,0.5)] transition active:scale-[0.98] disabled:opacity-40">
          {submitting ? "Placing order…" : <>Place order · <span className="tabular-nums">${formatPrice(quote.totalCents)}</span></>}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-secondary">{label}</span>
      <span className={`tabular-nums ${positive ? "font-semibold text-success" : "text-ink"}`}>{value}</span>
    </div>
  );
}
