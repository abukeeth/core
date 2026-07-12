"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, EmptyState, FilterPills, PageHeader, PageShell, ResponsiveTable, Skeleton } from "@/components/ui";
import { listOwnOrders, type OwnerOrder } from "@/lib/owner-commerce-api";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function statusBadgeTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "CANCELLED" || status === "REFUNDED") return "danger";
  if (status === "COMPLETED" || status === "READY") return "success";
  if (status === "OUT_FOR_DELIVERY") return "info";
  return "warning";
}

const STATUSES = ["", "PENDING_PAYMENT", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELLED", "REFUNDED"] as const;

export default function OrdersPage() {
  const [orders, setOrders] = useState<OwnerOrder[]>([]);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listOwnOrders(status ? { status } : {})
      .then((result) => {
        if (!cancelled) setOrders(result.orders);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load orders");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  function handleStatusChange(next: (typeof STATUSES)[number]) {
    setLoading(true);
    setStatus(next);
  }

  return (
    <PageShell maxWidth="4xl">
      <PageHeader eyebrow="ORDERS" title="Orders" description="Every order placed on your storefront, live." />

      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <FilterPills options={STATUSES} value={status} onChange={handleStatusChange} />

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState title="No orders yet" description="Orders placed on your storefront will show up here in real time." />
      ) : (
        <>
          {/* Mobile: card list */}
          <ul className="flex flex-col gap-3 sm:hidden">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/dashboard/orders/${order.id}`}
                  className="flex flex-col gap-2 rounded-2xl border border-[#E7DDCF] bg-white p-4 shadow-[0_8px_24px_rgba(48,39,27,0.04)] active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-[#171512]">#{order.orderNumber}</span>
                    <span className="font-bold text-[#9A6A2F]">${formatPrice(order.totalCents)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Badge tone={statusBadgeTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>
                    <span className="text-xs text-[#8A7D6C]">{new Date(order.placedAt).toLocaleString()}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop/tablet: table */}
          <div className="hidden sm:block">
            <ResponsiveTable>
              <thead className="border-b border-[#EEE5D9] text-left text-xs font-bold uppercase tracking-wide text-[#8A7D6C]">
                <tr>
                  <th className="p-3">#</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Source</th>
                  <th className="p-3">Total</th>
                  <th className="p-3">Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-[#EEE5D9] last:border-0 hover:bg-[#FFFDF9]">
                    <td className="p-3">
                      <Link href={`/dashboard/orders/${order.id}`} className="font-bold text-[#171512] hover:text-[#A9681F]">
                        #{order.orderNumber}
                      </Link>
                    </td>
                    <td className="p-3">
                      <Badge tone={statusBadgeTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>
                    </td>
                    <td className="p-3 text-[#756B5D]">{order.source}</td>
                    <td className="p-3 font-semibold">${formatPrice(order.totalCents)}</td>
                    <td className="p-3 text-[#8A7D6C]">{new Date(order.placedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </ResponsiveTable>
          </div>
        </>
      )}
    </PageShell>
  );
}
