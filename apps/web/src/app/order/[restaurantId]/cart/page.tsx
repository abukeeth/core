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

/* Cart — Figma "Customer Storefront V1 / Cart" (node 108:2), restyled to the
 * warm palette. All logic (quantities, fulfillment, address picker, coupon,
 * loyalty redemption, subtotal, checkout) is unchanged from the previous
 * version; only presentation classes were swapped. */

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

const FIELD = "rounded-[12px] border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand";
const CARD = "flex flex-col gap-2 rounded-[18px] border border-line bg-surface p-4";

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
    return <p className="p-8 text-sm text-ink-secondary">{error ?? "Loading cart…"}</p>;
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-canvas p-6 text-ink">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl font-semibold text-ink">Your cart</h1>
          <Link href={`/order/${restaurantId}`} className="text-sm text-ink-secondary">
            ← Back to menu
          </Link>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {cart.items.length === 0 && (
          <p className="text-sm text-ink-secondary">Your cart is empty.</p>
        )}

        <ul className="flex flex-col divide-y divide-line rounded-[18px] border border-line bg-surface">
          {cart.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-ink">
                  {item.menuItem?.name ?? "Item"}
                </span>
                {item.modifiersSnapshot?.variantName && (
                  <span className="text-xs text-ink-muted">{item.modifiersSnapshot.variantName}</span>
                )}
                <span className="text-sm text-ink-secondary">${formatPrice(item.unitPriceCents)} each</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                  className="rounded-full border border-line px-2 py-1 text-sm text-ink"
                >
                  −
                </button>
                <span className="w-6 text-center text-sm text-ink">{item.quantity}</span>
                <button
                  type="button"
                  onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                  className="rounded-full border border-line px-2 py-1 text-sm text-ink"
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className={CARD}>
          <span className="text-sm font-semibold text-ink">Fulfillment</span>
          <div className="flex gap-2">
            {(["PICKUP", "DELIVERY", "DINE_IN"] as FulfillmentType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleFulfillmentChange(type)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  cart.fulfillmentType === type
                    ? "bg-brand text-white"
                    : "border border-line text-ink-secondary"
                }`}
              >
                {type === "DINE_IN" ? "Dine in" : type.charAt(0) + type.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          {cart.fulfillmentType === "DELIVERY" && (
            <div className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
              {!authChecked && <p className="text-sm text-ink-secondary">Checking your account…</p>}

              {authChecked && !customer && (
                <p className="text-sm text-ink-secondary">
                  <Link href="/account/login" className="font-semibold text-brand">
                    Log in
                  </Link>{" "}
                  to deliver to a saved address.
                </p>
              )}

              {authChecked && customer && (
                <>
                  <span className="text-sm font-semibold text-ink">Deliver to</span>

                  {addresses.length === 0 && !showAddAddress && (
                    <p className="text-sm text-ink-secondary">No saved addresses yet.</p>
                  )}

                  {addresses.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {addresses.map((address) => (
                        <li key={address.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectAddress(address.id)}
                            className={`w-full rounded-[12px] border px-3 py-2 text-left text-sm ${
                              cart.deliveryAddressId === address.id
                                ? "border-transparent bg-brand text-white"
                                : "border-line text-ink-secondary"
                            }`}
                          >
                            {address.line1}, {address.city}, {address.state} {address.postalCode}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {addressError && <p className="text-sm text-danger">{addressError}</p>}

                  {showAddAddress ? (
                    <form onSubmit={handleAddAddress} className="flex flex-col gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Street address"
                        value={newAddress.line1}
                        onChange={(e) => setNewAddress((prev) => ({ ...prev, line1: e.target.value }))}
                        className={FIELD}
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="City"
                          value={newAddress.city}
                          onChange={(e) => setNewAddress((prev) => ({ ...prev, city: e.target.value }))}
                          className={`flex-1 ${FIELD}`}
                        />
                        <input
                          type="text"
                          required
                          placeholder="State"
                          value={newAddress.state}
                          onChange={(e) => setNewAddress((prev) => ({ ...prev, state: e.target.value }))}
                          className={`w-20 ${FIELD}`}
                        />
                        <input
                          type="text"
                          required
                          placeholder="ZIP"
                          value={newAddress.postalCode}
                          onChange={(e) => setNewAddress((prev) => ({ ...prev, postalCode: e.target.value }))}
                          className={`w-24 ${FIELD}`}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
                          Save address
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowAddAddress(false)}
                          className="rounded-full border border-line px-4 py-2 text-sm text-ink"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAddAddress(true)}
                      className="self-start text-sm font-semibold text-brand"
                    >
                      + Add a new address
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className={CARD}>
          <span className="text-sm font-semibold text-ink">Coupon</span>
          {cart.couponCode ? (
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink">{cart.couponCode}</span>
              <button type="button" onClick={handleRemoveCoupon} className="text-sm text-danger">
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="Promo code"
                className={`flex-1 ${FIELD}`}
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {authChecked && customer && loyalty?.program?.isActive && (
          <div className={CARD}>
            <span className="text-sm font-semibold text-ink">
              Loyalty points — you have {loyalty.pointsBalance}
            </span>
            {cart.loyaltyPointsToRedeem ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink">Redeeming {cart.loyaltyPointsToRedeem} points</span>
                <button type="button" onClick={handleRemoveLoyaltyRedemption} className="text-sm text-danger">
                  Remove
                </button>
              </div>
            ) : (
              loyalty.pointsBalance > 0 && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    max={loyalty.pointsBalance}
                    value={redeemPoints}
                    onChange={(e) => setRedeemPoints(e.target.value)}
                    placeholder="Points to redeem"
                    className={`flex-1 ${FIELD}`}
                  />
                  <button
                    type="button"
                    onClick={handleApplyLoyaltyRedemption}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
                  >
                    Redeem
                  </button>
                </div>
              )
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-[18px] border border-line bg-surface p-4">
          <span className="text-sm font-semibold text-ink">Subtotal</span>
          <span className="font-display text-lg font-semibold text-ink">${formatPrice(subtotalCents)}</span>
        </div>

        <Link
          href={`/order/${restaurantId}/checkout`}
          className={`rounded-full bg-brand px-5 py-3 text-center text-sm font-semibold text-white ${
            cart.items.length === 0 ? "pointer-events-none opacity-40" : ""
          }`}
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
