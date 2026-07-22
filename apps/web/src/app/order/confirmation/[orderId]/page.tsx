"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getPublicOrder, type Order } from "@/lib/commerce-api";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
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
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-line bg-surface p-8 text-center">
        <h1 className="text-xl font-semibold text-ink font-display">Order placed!</h1>
        <p className="text-sm text-ink-secondary">Order #{order.orderNumber}</p>
        <p className="text-lg font-semibold text-ink">${formatPrice(order.totalCents)}</p>
        <p className="text-sm text-ink-secondary">Status: {order.status}</p>
        <Link href={`/order/track/${order.id}`} className="rounded-full bg-brand px-5 py-2 text-sm text-white">
          Track your order
        </Link>
      </div>
    </div>
  );
}
