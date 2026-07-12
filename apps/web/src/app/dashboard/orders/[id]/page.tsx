"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, PageHeader, PageShell, Skeleton } from "@/components/ui";
import {
  assignDriver,
  cancelOrder,
  completeOrder,
  getOwnOrder,
  listDriverCandidates,
  markOutForDelivery,
  markPaidCash,
  markReady,
  refundOrder,
  startPreparing,
  type DriverCandidate,
  type OwnerOrderDetail,
} from "@/lib/owner-commerce-api";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

function statusBadgeTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "CANCELLED" || status === "REFUNDED") return "danger";
  if (status === "COMPLETED" || status === "READY") return "success";
  if (status === "OUT_FOR_DELIVERY") return "info";
  return "warning";
}

const NEXT_ACTIONS: Record<string, { label: string; action: (id: string) => Promise<{ order: OwnerOrderDetail }> }[]> = {
  CONFIRMED: [{ label: "Start preparing", action: startPreparing }],
  PREPARING: [
    { label: "Mark ready", action: markReady },
    { label: "Mark out for delivery", action: markOutForDelivery },
  ],
  READY: [{ label: "Complete", action: completeOrder }],
  OUT_FOR_DELIVERY: [{ label: "Complete", action: completeOrder }],
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OwnerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [drivers, setDrivers] = useState<DriverCandidate[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [assigningDriver, setAssigningDriver] = useState(false);

  const refresh = useCallback(() => {
    return getOwnOrder(orderId)
      .then((result) => setOrder(result.order))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load order"));
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    getOwnOrder(orderId)
      .then((result) => {
        if (!cancelled) setOrder(result.order);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load order");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const fulfillmentMethod = order?.fulfillment?.method;
  useEffect(() => {
    if (fulfillmentMethod !== "RESTAURANT_DRIVER") return;
    let cancelled = false;
    listDriverCandidates()
      .then((result) => {
        if (!cancelled) setDrivers(result.drivers);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load drivers");
      });
    return () => {
      cancelled = true;
    };
  }, [fulfillmentMethod]);

  /**
   * Also serves as the reassign action — assigning a fulfillment that
   * already has a different active driver silently moves it to the new
   * one (server-side upsert), so no separate "reassign" code path exists.
   * Deliberately not built yet: unassign, automatic/AI assignment, and
   * online/busy/offline driver status — this control is designed so each
   * can be added later (e.g. an "Unassign" button calling a future
   * unassign endpoint, or an "Auto-assign" button next to this select)
   * without restructuring what's here.
   */
  async function handleAssignDriver() {
    const fulfillmentId = order?.fulfillment?.id;
    if (!fulfillmentId || !selectedDriverId) return;
    setAssigningDriver(true);
    try {
      await assignDriver(fulfillmentId, selectedDriverId);
      setSelectedDriverId("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign driver");
    } finally {
      setAssigningDriver(false);
    }
  }

  async function handleAction(action: (id: string) => Promise<{ order: OwnerOrderDetail }>) {
    try {
      await action(orderId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function handleCancel() {
    try {
      await cancelOrder(orderId, "Cancelled by staff");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  async function handleMarkPaid() {
    try {
      await markPaidCash(orderId);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark paid");
    }
  }

  async function handleRefund() {
    const amountCents = Math.round(Number(refundAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;
    try {
      await refundOrder(orderId, amountCents, "CUSTOMER_REQUEST");
      setRefundAmount("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    }
  }

  if (!order) {
    return (
      <PageShell maxWidth="2xl">
        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </PageShell>
    );
  }

  const nextActions = NEXT_ACTIONS[order.status] ?? [];
  const canCancel = order.status !== "CANCELLED" && order.status !== "COMPLETED" && order.status !== "REFUNDED";

  return (
    <PageShell maxWidth="2xl">
      <PageHeader eyebrow="ORDER DETAIL" title={`Order #${order.orderNumber}`} />
      {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={statusBadgeTone(order.status)}>{order.status.replaceAll("_", " ")}</Badge>
          <Badge tone={order.paymentStatus === "PAID" ? "success" : "warning"}>{order.paymentStatus}</Badge>
          <Badge tone="neutral">{order.fulfillmentType.replaceAll("_", " ")}</Badge>
        </div>
        <p className="mt-4 text-3xl font-bold tracking-tight">${formatPrice(order.totalCents)}</p>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-[#EEE5D9]">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-bold text-[#9A6A2F]">{item.quantity}×</span> {item.menuItemNameSnapshot}
              </span>
              <span className="shrink-0 font-semibold">${formatPrice(item.unitPriceCents * item.quantity)}</span>
            </li>
          ))}
        </ul>
      </Card>

      <div className="flex flex-wrap gap-2">
        {nextActions.map((next) => (
          <Button key={next.label} onClick={() => handleAction(next.action)}>
            {next.label}
          </Button>
        ))}
        {order.paymentStatus === "UNPAID" && <Button variant="secondary" onClick={handleMarkPaid}>Mark paid (cash)</Button>}
        {canCancel && <Button variant="danger" onClick={handleCancel}>Cancel order</Button>}
      </div>

      {order.payment && (
        <Card>
          <label className="flex flex-col gap-2 text-sm font-semibold text-[#2A251F]">
            Refund amount ($)
            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                step="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                className="min-h-11 w-32 rounded-xl border border-[#E7DDCF] bg-[#FFFDF9] px-3 text-base font-normal text-[#171512] outline-none focus:border-[#B97824]"
              />
              <Button variant="danger" onClick={handleRefund}>Issue refund</Button>
            </div>
          </label>
        </Card>
      )}

      {order.fulfillment && order.fulfillment.method === "RESTAURANT_DRIVER" && (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">Driver</h2>
          {order.fulfillment.driverAssignment ? (
            <p className="text-sm text-[#756B5D]">
              Currently assigned to{" "}
              <strong className="text-[#171512]">{drivers.find((d) => d.id === order.fulfillment!.driverAssignment!.driverId)?.name ?? "a driver"}</strong>{" "}
              — status: {order.fulfillment.driverAssignment.status}
            </p>
          ) : (
            <p className="text-sm text-[#756B5D]">No driver assigned yet.</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="min-h-11 rounded-xl border border-[#E7DDCF] bg-[#FFFDF9] px-3 text-sm text-[#171512] outline-none focus:border-[#B97824]"
            >
              <option value="">Select a driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.activeAssignmentCount > 0 ? ` (busy: ${d.activeAssignmentCount})` : ""}
                </option>
              ))}
            </select>
            <Button onClick={handleAssignDriver} disabled={!selectedDriverId || assigningDriver}>
              {order.fulfillment.driverAssignment ? "Reassign driver" : "Assign driver"}
            </Button>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
