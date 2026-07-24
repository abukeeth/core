"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  applyCoupon,
  applyLoyaltyRedemption,
  createAddress,
  customerMe,
  getCart,
  getLoyaltyBalance,
  listAddresses,
  removeCartItem,
  removeCoupon,
  removeLoyaltyRedemption,
  setCartFulfillment,
  updateCartItemQuantity,
  type Cart,
  type CustomerAddress,
  type FulfillmentType,
  type LoyaltyAccountSummary,
  type PublicCustomer,
} from "@/lib/commerce-api";
import { getStoredCartId } from "@/lib/cart-storage";

/* Cart — Customer Storefront V2 "Appetite Premium". All logic (quantities,
 * fulfillment, address picker, coupon, loyalty redemption, subtotal, checkout)
 * is unchanged; only presentation was rebuilt to match the storefront. */

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

/* Warm food-tone gradient placeholders, deterministic per item (shared visual
 * language with the storefront until real product photography exists). */
const TONES = [
  "linear-gradient(150deg,#E7C48C 0%,#B06F35 100%)",
  "linear-gradient(150deg,#DCC29A 0%,#8C6238 100%)",
  "linear-gradient(150deg,#E9CE9C 0%,#A5713C 100%)",
  "linear-gradient(150deg,#D8B98A 0%,#7E5A34 100%)",
  "linear-gradient(150deg,#E3C58F 0%,#95693A 100%)",
  "linear-gradient(150deg,#EAD6AE 0%,#B58347 100%)",
];
function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}

const FIELD = "w-full rounded-[12px] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none transition focus:border-ink placeholder:text-ink-muted";
const CARD = "flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5";
const LABEL = "font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted";

export default function CartPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = params.restaurantId;
  const router = useRouter();

  const [cart, setCart] = useState<Cart | null>(null);
  const [subtotalCents, setSubtotalCents] = useState(0);
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cartId] = useState<string | null>(() => getStoredCartId(restaurantId));

  // Delivery address picker (Sprint 08.1) — addresses are a logged-in-
  // customer feature only (guest checkout has no saved addresses), so
  // authChecked distinguishes "still checking" from "confirmed guest".
  const [customer, setCustomer] = useState<PublicCustomer | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState({ line1: "", city: "", state: "", postalCode: "", country: "US" });

  const [loyalty, setLoyalty] = useState<LoyaltyAccountSummary | null>(null);
  const [redeemPoints, setRedeemPoints] = useState("");

  useEffect(() => {
    if (!cartId) {
      router.replace(`/order/${restaurantId}`);
    }
  }, [cartId, restaurantId, router]);

  useEffect(() => {
    customerMe()
      .then(({ customer: me }) => {
        setCustomer(me);
        return listAddresses();
      })
      .then((result) => {
        if (result) setAddresses(result.addresses);
      })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!customer) return;
    getLoyaltyBalance(restaurantId)
      .then(setLoyalty)
      .catch(() => undefined);
  }, [customer, restaurantId]);

  function refresh(id: string) {
    return getCart(id)
      .then((result) => {
        setCart(result.cart);
        setSubtotalCents(result.subtotalCents);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load cart");
      });
  }

  useEffect(() => {
    if (!cartId) return;
    let cancelled = false;
    getCart(cartId)
      .then((result) => {
        if (cancelled) return;
        setCart(result.cart);
        setSubtotalCents(result.subtotalCents);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load cart");
      });
    return () => {
      cancelled = true;
    };
  }, [cartId]);

  async function handleQuantityChange(itemId: string, quantity: number) {
    if (!cartId) return;
    if (quantity < 1) {
      await removeCartItem(cartId, itemId);
    } else {
      await updateCartItemQuantity(cartId, itemId, quantity);
    }
    refresh(cartId);
  }

  async function handleFulfillmentChange(fulfillmentType: FulfillmentType) {
    if (!cartId) return;
    await setCartFulfillment(cartId, { fulfillmentType });
    refresh(cartId);
  }

  async function handleSelectAddress(deliveryAddressId: string) {
    if (!cartId) return;
    await setCartFulfillment(cartId, { fulfillmentType: "DELIVERY", deliveryAddressId });
    refresh(cartId);
  }

  async function handleAddAddress(event: React.FormEvent) {
    event.preventDefault();
    if (!cartId) return;
    setAddressError(null);
    try {
      const { address } = await createAddress(newAddress);
      setAddresses((prev) => [...prev, address]);
      setNewAddress({ line1: "", city: "", state: "", postalCode: "", country: "US" });
      setShowAddAddress(false);
      await handleSelectAddress(address.id);
    } catch (err) {
      setAddressError(err instanceof Error ? err.message : "Failed to add address");
    }
  }

  async function handleApplyCoupon() {
    if (!cartId || !couponCode) return;
    try {
      await applyCoupon(cartId, couponCode);
      setError(null);
      refresh(cartId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid coupon");
    }
  }

  async function handleRemoveCoupon() {
    if (!cartId) return;
    await removeCoupon(cartId);
    refresh(cartId);
  }

  async function handleApplyLoyaltyRedemption() {
    if (!cartId || !redeemPoints) return;
    try {
      await applyLoyaltyRedemption(cartId, Number(redeemPoints));
      setError(null);
      refresh(cartId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not redeem those points");
    }
  }

  async function handleRemoveLoyaltyRedemption() {
    if (!cartId) return;
    await removeLoyaltyRedemption(cartId);
    setRedeemPoints("");
    refresh(cartId);
  }

  if (!cart) {
    return <div className="flex flex-1 items-center justify-center bg-canvas p-8 text-sm text-ink-secondary">{error ?? "Loading cart…"}</div>;
  }

  const isEmpty = cart.items.length === 0;

  return (
    <div className="relative flex flex-1 flex-col bg-canvas text-ink">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col">

        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-canvas/85 px-4 py-3.5 backdrop-blur-xl">
          <h1 className="font-display text-[19px] font-bold tracking-[-0.01em]">Your cart</h1>
          <Link href={`/order/${restaurantId}`} className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-secondary">← Menu</Link>
        </header>

        <div className="flex flex-col gap-4 px-4 pb-40 pt-4">
          {error && <div className="rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

          {isEmpty ? (
            <div className="flex flex-col items-center gap-3 rounded-[20px] border border-line bg-surface px-6 py-12 text-center">
              <p className="text-sm text-ink-secondary">Your cart is empty.</p>
              <Link href={`/order/${restaurantId}`} className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-canvas">Browse the menu</Link>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-[20px] border border-line bg-surface">
              {cart.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3.5 border-b border-line p-4 last:border-b-0">
                    <span className="relative size-14 shrink-0 overflow-hidden rounded-[12px] bg-subtle" style={{ backgroundImage: toneFor(item.menuItemId || item.id) }}>
                      <span className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 25% 15%, rgba(255,255,255,.28), transparent 55%)" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[15px] font-semibold leading-tight">{item.menuItem?.name ?? "Item"}</p>
                      {item.modifiersSnapshot?.variantName && (
                        <p className="truncate text-xs text-ink-muted">{item.modifiersSnapshot.variantName}</p>
                      )}
                      <div className="mt-2 inline-flex items-center gap-3.5 rounded-full border border-line px-3 py-1.5">
                        <button type="button" aria-label="Decrease quantity" onClick={() => handleQuantityChange(item.id, item.quantity - 1)} className="text-lg leading-none text-ink">−</button>
                        <span className="min-w-4 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                        <button type="button" aria-label="Increase quantity" onClick={() => handleQuantityChange(item.id, item.quantity + 1)} className="text-lg leading-none text-ink">+</button>
                      </div>
                    </div>
                    <span className="shrink-0 font-display text-[15px] font-bold tabular-nums">${formatPrice(item.unitPriceCents * item.quantity)}</span>
                  </li>
                ))}
            </ul>
          )}

          {/* Fulfillment */}
          <div className={CARD}>
                <span className={LABEL}>Fulfillment</span>
                <div className="flex gap-2">
                  {(["PICKUP", "DELIVERY", "DINE_IN"] as FulfillmentType[]).map((type) => {
                    const active = cart.fulfillmentType === type;
                    return (
                      <button key={type} type="button" onClick={() => handleFulfillmentChange(type)}
                        aria-pressed={active}
                        className={`flex-1 rounded-full py-2.5 text-[13px] font-semibold transition ${active ? "bg-ink text-canvas" : "border border-line text-ink-secondary"}`}>
                        {type === "DINE_IN" ? "Dine in" : type.charAt(0) + type.slice(1).toLowerCase()}
                      </button>
                    );
                  })}
                </div>

                {cart.fulfillmentType === "DELIVERY" && (
                  <div className="mt-1 flex flex-col gap-3 border-t border-line pt-4">
                    {!authChecked && <p className="text-sm text-ink-secondary">Checking your account…</p>}

                    {authChecked && !customer && (
                      <p className="text-sm text-ink-secondary">
                        <Link href="/account/login" className="font-semibold text-brand">Log in</Link>{" "}
                        to deliver to a saved address.
                      </p>
                    )}

                    {authChecked && customer && (
                      <>
                        <span className={LABEL}>Deliver to</span>

                        {addresses.length === 0 && !showAddAddress && (
                          <p className="text-sm text-ink-secondary">No saved addresses yet.</p>
                        )}

                        {addresses.length > 0 && (
                          <ul className="flex flex-col gap-2">
                            {addresses.map((address) => {
                              const selected = cart.deliveryAddressId === address.id;
                              return (
                                <li key={address.id}>
                                  <button type="button" onClick={() => handleSelectAddress(address.id)}
                                    className={`w-full rounded-[12px] border px-3.5 py-3 text-left text-sm transition ${selected ? "border-ink bg-ink text-canvas" : "border-line text-ink-secondary"}`}>
                                    {address.line1}, {address.city}, {address.state} {address.postalCode}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {addressError && <p className="text-sm text-danger">{addressError}</p>}

                        {showAddAddress ? (
                          <form onSubmit={handleAddAddress} className="flex flex-col gap-2">
                            <input type="text" required placeholder="Street address" value={newAddress.line1}
                              onChange={(e) => setNewAddress((prev) => ({ ...prev, line1: e.target.value }))} className={FIELD} />
                            <div className="flex gap-2">
                              <input type="text" required placeholder="City" value={newAddress.city}
                                onChange={(e) => setNewAddress((prev) => ({ ...prev, city: e.target.value }))} className={`flex-1 ${FIELD}`} />
                              <input type="text" required placeholder="State" value={newAddress.state}
                                onChange={(e) => setNewAddress((prev) => ({ ...prev, state: e.target.value }))} className={`w-20 ${FIELD}`} />
                              <input type="text" required placeholder="ZIP" value={newAddress.postalCode}
                                onChange={(e) => setNewAddress((prev) => ({ ...prev, postalCode: e.target.value }))} className={`w-24 ${FIELD}`} />
                            </div>
                            <div className="flex gap-2">
                              <button type="submit" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas">Save address</button>
                              <button type="button" onClick={() => setShowAddAddress(false)} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold text-ink">Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <button type="button" onClick={() => setShowAddAddress(true)} className="self-start text-sm font-semibold text-brand">+ Add a new address</button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Coupon */}
              <div className={CARD}>
                <span className={LABEL}>Coupon</span>
                {cart.couponCode ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{cart.couponCode}</span>
                    <button type="button" onClick={handleRemoveCoupon} className="text-sm font-semibold text-danger">Remove</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="Promo code" className={`flex-1 ${FIELD}`} />
                    <button type="button" onClick={handleApplyCoupon} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas">Apply</button>
                  </div>
                )}
              </div>

              {/* Loyalty */}
              {authChecked && customer && loyalty?.program?.isActive && (
                <div className={CARD}>
                  <span className={LABEL}>Loyalty · {loyalty.pointsBalance} points</span>
                  {cart.loyaltyPointsToRedeem ? (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-ink">Redeeming {cart.loyaltyPointsToRedeem} points</span>
                      <button type="button" onClick={handleRemoveLoyaltyRedemption} className="text-sm font-semibold text-danger">Remove</button>
                    </div>
                  ) : (
                    loyalty.pointsBalance > 0 && (
                      <div className="flex gap-2">
                        <input type="number" min="1" max={loyalty.pointsBalance} value={redeemPoints}
                          onChange={(e) => setRedeemPoints(e.target.value)} placeholder="Points to redeem" className={`flex-1 ${FIELD}`} />
                        <button type="button" onClick={handleApplyLoyaltyRedemption} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-canvas">Redeem</button>
                      </div>
                    )
                  )}
                </div>
              )}
        </div>
      </div>

      {/* Sticky subtotal + checkout */}
      {!isEmpty && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-6"
          style={{ background: "linear-gradient(transparent, var(--ov-canvas) 32%)" }}>
          <div className="pointer-events-auto mx-auto w-full max-w-[460px] rounded-[20px] border border-line bg-surface p-4 shadow-[0_-4px_30px_-16px_rgba(30,20,6,0.3)]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-ink-secondary">Subtotal</span>
              <span className="font-display text-lg font-bold tabular-nums">${formatPrice(subtotalCents)}</span>
            </div>
            <Link href={`/order/${restaurantId}/checkout`}
              className="flex items-center justify-center rounded-full bg-ink px-5 py-3.5 text-[15px] font-semibold text-canvas shadow-sm transition active:scale-[0.98]">
              Proceed to checkout
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
