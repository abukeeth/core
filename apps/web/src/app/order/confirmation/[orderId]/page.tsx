"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getPublicOrder, type Order } from "@/lib/commerce-api";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function fulfillmentLabel(type: string): string {
  const f = type.toUpperCase();
  if (f.includes("DELIVER")) return "Delivery";
  if (f.includes("DINE")) return "Dine-in";
  return "Pickup";
}

export default function OrderConfirmationPage() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicOrder(orderId)
      .then(({ order: loaded }) => {
        if (!cancelled) setOrder(loaded);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Order not found");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (error) {
    return <p className="p-8 text-sm text-danger">{error}</p>;
  }

  if (!order) {
    return <p className="p-8 text-sm text-ink-secondary">Loading…</p>;
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-canvas p-6">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-line bg-surface p-8">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-ink font-display">Order placed!</h1>
          <p className="mt-1 text-sm text-ink-secondary">Order #{order.orderNumber} · {fulfillmentLabel(order.fulfillmentType)}</p>
        </div>

        {order.items && order.items.length > 0 && (
          <ul className="flex flex-col gap-2 border-y border-line py-4 text-left">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-ink">
                  {item.quantity}× {item.nameSnapshot}
                  {item.variantNameSnapshot && <span className="text-ink-secondary"> · {item.variantNameSnapshot}</span>}
                </span>
                <span className="shrink-0 font-medium text-ink">${formatPrice(item.unitPriceCents * item.quantity)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-secondary">Total</span>
          <span className="text-lg font-semibold text-ink">${formatPrice(order.totalCents)}</span>
        </div>
        <p className="text-center text-sm text-ink-secondary">Status: {order.status}</p>
        <Link href={`/order/track/${order.id}`} className="rounded-full bg-brand px-5 py-2 text-center text-sm text-white">
          Track your order
        </Link>
      </div>
    </div>
  );
}
