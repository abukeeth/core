"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DetailShell } from "@/components/owner-shell";
import { Icon } from "@/components/owner-icons";
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

/* Order detail — Figma "Owner Dashboard V3 / Order Details" (node 29:8).
 * Layout rebuilt to the design system; all existing actions preserved
 * (status transitions, mark-paid, cancel, refund, driver assignment).
 * The order API exposes no customer identity, so the customer card is
 * rendered from real fulfillment/payment data instead of fabricated names. */

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
function relativeTime(date: string) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}
function fulfillmentLabel(type: string) {
  const f = type.toUpperCase();
  if (f.includes("DELIVER")) return "Delivery";
  if (f.includes("DINE")) return "Dine-in";
  return "Pickup";
}
function paymentLabel(status: string) {
  const p = status.toUpperCase();
  if (p.includes("PAID") || p.includes("CAPTURED") || p.includes("SUCCE")) return "Paid";
  if (p.includes("REFUND")) return "Refunded";
  if (p.includes("FAIL")) return "Payment failed";
  return "Payment pending";
}

const STEPS = ["New", "Preparing", "Ready", "Completed"] as const;
function currentStep(status: string): number {
  const s = status.toUpperCase();
  if (s.includes("COMPLETE")) return 3;
  if (s.includes("READY") || s.includes("DELIVER")) return 2;
  if (s.includes("PREPAR")) return 1;
  return 0;
}
function banner(status: string): { title: string; body: string; tone: "brand" | "info" | "success" | "cancel" } {
  const s = status.toUpperCase();
  if (s.includes("CANCEL") || s.includes("REFUND")) return { title: "Order cancelled", body: "This order is no longer active.", tone: "cancel" };
  if (s.includes("COMPLETE")) return { title: "Order completed", body: "This order has been handed off.", tone: "success" };
  if (s.includes("READY")) return { title: "Ready for the customer", body: "Complete it once it’s handed off.", tone: "success" };
  if (s.includes("DELIVER")) return { title: "Out for delivery", body: "Complete it once it’s delivered.", tone: "info" };
  if (s.includes("PREPAR")) return { title: "In the kitchen", body: "Mark it ready when it’s done.", tone: "info" };
  return { title: "Waiting for acceptance", body: "Accept the order to start preparing it.", tone: "brand" };
}
const BANNER_STYLE: Record<"brand" | "info" | "success" | "cancel", string> = {
  brand: "border-brand bg-brand-soft",
  info: "border-info/30 bg-info/5",
  success: "border-success/30 bg-success/5",
  cancel: "border-danger/30 bg-danger/5",
};
const BANNER_ICON: Record<"brand" | "info" | "success" | "cancel", string> = {
  brand: "bg-brand text-white",
  info: "bg-info text-white",
  success: "bg-success text-white",
  cancel: "bg-danger text-white",
};

const NEXT_ACTIONS: Record<string, { label: string; action: (id: string) => Promise<{ order: OwnerOrderDetail }> }[]> = {
  CONFIRMED: [{ label: "Accept & start preparing", action: startPreparing }],
  PREPARING: [
    { label: "Mark ready", action: markReady },
    { label: "Out for delivery", action: markOutForDelivery },
  ],
  READY: [{ label: "Complete order", action: completeOrder }],
  OUT_FOR_DELIVERY: [{ label: "Complete order", action: completeOrder }],
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OwnerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
      .then((result) => { if (!cancelled) setOrder(result.order); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load order"); });
    return () => { cancelled = true; };
  }, [orderId]);

  const fulfillmentMethod = order?.fulfillment?.method;
  useEffect(() => {
    if (fulfillmentMethod !== "RESTAURANT_DRIVER") return;
    let cancelled = false;
    listDriverCandidates()
      .then((result) => { if (!cancelled) setDrivers(result.drivers); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load drivers"); });
    return () => { cancelled = true; };
  }, [fulfillmentMethod]);

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

  async function runAction(fn: (id: string) => Promise<{ order: OwnerOrderDetail }>) {
    setBusy(true);
    setError(null);
    try {
      await fn(orderId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const handleCancel = () => runAction((id) => cancelOrder(id, "Cancelled by staff"));
  const handleMarkPaid = () => runAction(markPaidCash);

  async function handleRefund() {
    const amountCents = Math.round(Number(refundAmount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;
    setBusy(true);
    try {
      await refundOrder(orderId, amountCents, "CUSTOMER_REQUEST");
      setRefundAmount("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed");
    } finally {
      setBusy(false);
    }
  }

  const step = useMemo(() => (order ? currentStep(order.status) : 0), [order]);

  if (!order) {
    return (
      <DetailShell title="Order" backHref="/dashboard/orders">
        {error ? (
          <div className="rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>
        ) : (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-[18px] border border-line bg-surface" />
            <div className="h-40 animate-pulse rounded-[18px] border border-line bg-surface" />
          </div>
        )}
      </DetailShell>
    );
  }

  const b = banner(order.status);
  const isCancelled = order.status.toUpperCase().includes("CANCEL") || order.status.toUpperCase().includes("REFUND");
  const nextActions = NEXT_ACTIONS[order.status] ?? [];
  const canCancel = !isCancelled && !order.status.toUpperCase().includes("COMPLETE");
  const unpaid = order.paymentStatus.toUpperCase() === "UNPAID";

  const footer = (nextActions.length > 0 || canCancel) ? (
    <>
      {canCancel && (
        <button type="button" onClick={handleCancel} disabled={busy}
          className="flex-1 rounded-[16px] border border-line bg-surface px-4 py-3.5 text-sm font-semibold text-ink transition disabled:opacity-50">
          {nextActions.length > 0 ? "Decline" : "Cancel order"}
        </button>
      )}
      {nextActions.map((next, i) => (
        <button key={next.label} type="button" onClick={() => runAction(next.action)} disabled={busy}
          className={`flex-1 rounded-[16px] px-4 py-3.5 text-sm font-semibold transition disabled:opacity-50 ${i === 0 ? "bg-brand text-white" : "border border-line bg-surface text-ink"}`}>
          {next.label}
        </button>
      ))}
    </>
  ) : undefined;

  return (
    <DetailShell title={`Order #${order.orderNumber}`} subtitle={`Placed ${relativeTime(order.placedAt)}`} backHref="/dashboard/orders" footer={footer}>
      {error && <div className="mb-3.5 rounded-[18px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

      {/* Status banner */}
      <div className={`flex items-center gap-3 rounded-[18px] border p-3.5 ${BANNER_STYLE[b.tone]}`}>
        <span className={`flex size-[42px] shrink-0 items-center justify-center rounded-[13px] ${BANNER_ICON[b.tone]}`}>
          <Icon name={b.tone === "success" ? "check" : b.tone === "cancel" ? "receipt" : "clock"} className="h-[21px] w-[21px]" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[17px] font-medium leading-[23px] text-ink">{b.title}</p>
          <p className="text-xs text-ink-secondary">{b.body}</p>
        </div>
      </div>

      {/* Fulfillment / details */}
      <div className="mt-3.5 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] font-medium text-ink">Fulfillment</h2>
          <span className={`text-xs font-semibold ${paymentLabel(order.paymentStatus) === "Paid" ? "text-success" : "text-ink-muted"}`}>{paymentLabel(order.paymentStatus)}</span>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-ink-secondary">Method</dt><dd className="font-medium text-ink">{fulfillmentLabel(order.fulfillmentType)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-ink-secondary">Source</dt><dd className="font-medium text-ink">{order.source.replaceAll("_", " ").toLowerCase()}</dd></div>
          {order.tableId && <div className="flex justify-between gap-4"><dt className="text-ink-secondary">Table</dt><dd className="font-medium text-ink">{order.tableId}</dd></div>}
          <div className="flex justify-between gap-4"><dt className="text-ink-secondary">Placed</dt><dd className="font-medium text-ink">{new Date(order.placedAt).toLocaleString()}</dd></div>
        </dl>
      </div>

      {/* Items + totals */}
      <div className="mt-3.5 rounded-[18px] border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-[17px] font-medium text-ink">{order.items.length} item{order.items.length === 1 ? "" : "s"}</h2>
        </div>
        <ul className="mt-3 space-y-2.5">
          {order.items.length === 0 ? (
            <li className="text-sm text-ink-secondary">No line items on this order.</li>
          ) : order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3">
              <span className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-[11px] font-semibold text-brand">{item.quantity}×</span>
                <span className="min-w-0 text-sm text-ink">{item.menuItemNameSnapshot}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-ink">{money(item.unitPriceCents * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-ink-secondary">Subtotal</dt><dd className="text-ink">{money(order.subtotalCents)}</dd></div>
          {order.discountCents > 0 && <div className="flex justify-between"><dt className="text-ink-secondary">Discount</dt><dd className="text-success">−{money(order.discountCents)}</dd></div>}
          <div className="flex justify-between"><dt className="text-ink-secondary">Tax</dt><dd className="text-ink">{money(order.taxCents)}</dd></div>
          {order.deliveryFeeCents > 0 && <div className="flex justify-between"><dt className="text-ink-secondary">Delivery</dt><dd className="text-ink">{money(order.deliveryFeeCents)}</dd></div>}
          {order.serviceFeeCents > 0 && <div className="flex justify-between"><dt className="text-ink-secondary">Service fee</dt><dd className="text-ink">{money(order.serviceFeeCents)}</dd></div>}
          {order.tipCents > 0 && <div className="flex justify-between"><dt className="text-ink-secondary">Tip</dt><dd className="text-ink">{money(order.tipCents)}</dd></div>}
          <div className="flex justify-between border-t border-line pt-2 font-display text-base font-semibold"><dt>Total</dt><dd>{money(order.totalCents)}</dd></div>
        </dl>
      </div>

      {/* Status stepper */}
      {!isCancelled && (
        <div className="mt-3.5 flex items-center justify-between rounded-[18px] border border-line bg-surface px-4 py-4">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col items-center gap-1.5">
              <span className={`flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ${i <= step ? "bg-brand text-white" : "bg-subtle text-ink-muted"}`}>
                {i < step ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`text-[10px] font-semibold ${i <= step ? "text-ink" : "text-ink-muted"}`}>{label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Payment / refund */}
      {(unpaid || order.payment) && (
        <div className="mt-3.5 rounded-[18px] border border-line bg-surface p-4">
          <h2 className="font-display text-[17px] font-medium text-ink">Payment</h2>
          {unpaid && (
            <button type="button" onClick={handleMarkPaid} disabled={busy}
              className="mt-3 w-full rounded-[14px] border border-line bg-subtle px-4 py-3 text-sm font-semibold text-ink transition disabled:opacity-50">
              Mark paid (cash)
            </button>
          )}
          {order.payment && (
            <div className="mt-3">
              <label className="text-sm font-semibold text-ink">Refund amount</label>
              <div className="mt-1.5 flex gap-2">
                <input type="number" step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} placeholder="0.00"
                  className="min-w-0 flex-1 rounded-[14px] border border-line bg-surface px-3.5 py-3 text-sm text-ink outline-none focus:border-brand" />
                <button type="button" onClick={handleRefund} disabled={busy}
                  className="rounded-[14px] border border-danger/40 bg-danger/5 px-4 py-3 text-sm font-semibold text-danger transition disabled:opacity-50">
                  Issue refund
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Driver (RESTAURANT_DRIVER only) — markup/text preserved for tests */}
      {order.fulfillment && order.fulfillment.method === "RESTAURANT_DRIVER" && (
        <div className="mt-3.5 rounded-[18px] border border-line bg-surface p-4">
          <h2 className="font-display text-lg font-bold text-ink">Driver</h2>
          {order.fulfillment.driverAssignment ? (
            <p className="mt-2 text-sm text-ink-secondary">
              Currently assigned to{" "}
              <strong className="text-ink">{drivers.find((d) => d.id === order.fulfillment!.driverAssignment!.driverId)?.name ?? "a driver"}</strong>{" "}
              — status: {order.fulfillment.driverAssignment.status}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink-secondary">No driver assigned yet.</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select value={selectedDriverId} onChange={(e) => setSelectedDriverId(e.target.value)}
              className="min-h-11 rounded-[14px] border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-brand">
              <option value="">Select a driver…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.activeAssignmentCount > 0 ? ` (busy: ${d.activeAssignmentCount})` : ""}</option>
              ))}
            </select>
            <button type="button" onClick={handleAssignDriver} disabled={!selectedDriverId || assigningDriver}
              className="rounded-[14px] bg-brand px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50">
              {order.fulfillment.driverAssignment ? "Reassign driver" : "Assign driver"}
            </button>
          </div>
        </div>
      )}
    </DetailShell>
  );
}
