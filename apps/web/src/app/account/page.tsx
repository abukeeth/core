"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createAddress,
  customerLogout,
  customerMe,
  deleteAddress,
  deleteFavorite,
  deletePaymentMethod,
  listAddresses,
  listCustomerOrders,
  listFavorites,
  listPaymentMethods,
  type CustomerAddress,
  type CustomerFavorite,
  type CustomerOrderSummary,
  type CustomerSavedPaymentMethod,
  type PublicCustomer,
} from "@/lib/commerce-api";

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

function formatOrderTotal(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function AccountPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState<PublicCustomer | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [favorites, setFavorites] = useState<CustomerFavorite[]>([]);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CustomerSavedPaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState({ line1: "", city: "", state: "", postalCode: "", country: "US" });

  useEffect(() => {
    customerMe()
      .then(({ customer: me }) => setCustomer(me))
      .catch(() => router.replace("/account/login"));
    listAddresses()
      .then(({ addresses: list }) => setAddresses(list))
      .catch(() => undefined);
    listFavorites()
      .then(({ favorites: list }) => setFavorites(list))
      .catch(() => undefined);
    listCustomerOrders()
      .then(({ orders: list }) => setOrders(list))
      .catch(() => undefined);
    listPaymentMethods()
      .then(({ paymentMethods: list }) => setPaymentMethods(list))
      .catch(() => undefined);
  }, [router]);

  async function handleLogout() {
    await customerLogout();
    router.push("/account/login");
  }

  async function handleAddAddress(event: React.FormEvent) {
    event.preventDefault();
    try {
      const { address } = await createAddress(newAddress);
      setAddresses((prev) => [...prev, address]);
      setNewAddress({ line1: "", city: "", state: "", postalCode: "", country: "US" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add address");
    }
  }

  async function handleDeleteAddress(id: string) {
    await deleteAddress(id);
    setAddresses((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleDeleteFavorite(id: string) {
    await deleteFavorite(id);
    setFavorites((prev) => prev.filter((f) => f.id !== id));
  }

  async function handleDeletePaymentMethod(id: string) {
    await deletePaymentMethod(id);
    setPaymentMethods((prev) => prev.filter((m) => m.id !== id));
  }

  if (!customer) {
    return <p className="p-8 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>;
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 p-6 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <div>
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">{customer.name}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{customer.email}</p>
          </div>
          <button type="button" onClick={handleLogout} className="text-sm text-red-600">
            Log out
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Addresses</h2>
          <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
            {addresses.map((address) => (
              <li key={address.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {address.line1}, {address.city}, {address.state} {address.postalCode}
                </span>
                <button type="button" onClick={() => handleDeleteAddress(address.id)} className="text-red-600">
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddAddress} className="flex flex-col gap-2">
            <input
              type="text"
              required
              placeholder="Street address"
              value={newAddress.line1}
              onChange={(e) => setNewAddress((prev) => ({ ...prev, line1: e.target.value }))}
              className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
            />
            <div className="flex gap-2">
              <input
                type="text"
                required
                placeholder="City"
                value={newAddress.city}
                onChange={(e) => setNewAddress((prev) => ({ ...prev, city: e.target.value }))}
                className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
              <input
                type="text"
                required
                placeholder="State"
                value={newAddress.state}
                onChange={(e) => setNewAddress((prev) => ({ ...prev, state: e.target.value }))}
                className="w-20 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
              <input
                type="text"
                required
                placeholder="ZIP"
                value={newAddress.postalCode}
                onChange={(e) => setNewAddress((prev) => ({ ...prev, postalCode: e.target.value }))}
                className="w-24 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
              />
            </div>
            <button type="submit" className="rounded-full bg-foreground px-4 py-2 text-sm text-background">
              Add address
            </button>
          </form>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Favorites</h2>
          {favorites.length === 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400">No favorites yet.</p>}
          <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
            {favorites.map((favorite) => (
              <li key={favorite.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {favorite.menuItem.name}
                  {!favorite.menuItem.isAvailable && (
                    <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">(currently unavailable)</span>
                  )}
                </span>
                <button type="button" onClick={() => handleDeleteFavorite(favorite.id)} className="text-red-600">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Saved payment methods</h2>
          {paymentMethods.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No saved cards yet — you can save one at checkout.</p>
          )}
          <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
            {paymentMethods.map((method) => (
              <li key={method.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {method.brand ?? "Card"} •••• {method.last4 ?? "----"}
                  {method.expMonth && method.expYear ? ` (exp ${method.expMonth}/${method.expYear})` : ""}
                  {method.isDefault && <span className="ml-2 text-xs text-zinc-500 dark:text-zinc-400">Default</span>}
                </span>
                <button type="button" onClick={() => handleDeletePaymentMethod(method.id)} className="text-red-600">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Order history</h2>
          {orders.length === 0 && <p className="text-sm text-zinc-600 dark:text-zinc-400">No past orders yet.</p>}
          <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
            {orders.map((order) => (
              <li key={order.id} className="flex items-center justify-between py-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-black dark:text-zinc-50">
                    {order.restaurant.name} — Order #{order.orderNumber}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(order.createdAt).toLocaleDateString()} · {ORDER_STATUS_LABELS[order.status] ?? order.status} ·{" "}
                    {formatOrderTotal(order.totalCents)}
                  </span>
                </div>
                <a href={`/order/track/${order.id}`} className="text-sm font-medium underline">
                  View
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
