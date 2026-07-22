"use client";

import { useEffect, useState } from "react";
import {
  adminDeleteRestaurant,
  adminListOrders,
  adminListPayments,
  adminListRestaurants,
  adminListUsers,
  adminSetUserActive,
  listAuditLog,
  suspendRestaurant,
  unsuspendRestaurant,
  type AdminOrderRow,
  type AdminPaymentRow,
  type AdminRestaurantRow,
  type AdminUserRow,
  type AuditLogEntry,
} from "@/lib/api";

type AdminTab = "restaurants" | "users" | "orders" | "payments" | "audit";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "restaurants", label: "Businesses" },
  { id: "users", label: "Users" },
  { id: "orders", label: "Orders" },
  { id: "payments", label: "Payments" },
  { id: "audit", label: "Audit log" },
];

function formatAction(action: string): string {
  return action.replace(/_/g, " ").toLowerCase();
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

const thClass = "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-[#756B5D]";
const tdClass = "px-3 py-2.5 text-sm text-[#171512]";
const pillClass = (tone: "ok" | "warn" | "bad" | "muted") =>
  `inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : tone === "bad"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-[#E7DDCF] bg-[#FBF7F1] text-[#756B5D]"
  }`;

/**
 * Super Admin MVP (launch sprint) — one panel, five tabs: Businesses
 * (suspend/unsuspend/DELETE with exact-name confirmation), Users
 * (deactivate/reactivate), cross-tenant Orders and Payments (read-only),
 * and the audit log every admin action writes to.
 */
export function AdminPanel({ initialAuditLog }: { initialAuditLog: AuditLogEntry[] }) {
  const [tab, setTab] = useState<AdminTab>("restaurants");
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [restaurants, setRestaurants] = useState<AdminRestaurantRow[] | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [orders, setOrders] = useState<AdminOrderRow[] | null>(null);
  const [payments, setPayments] = useState<AdminPaymentRow[] | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>(initialAuditLog);
  const [search, setSearch] = useState("");

  // Deliberately no synchronous setState here — this runs from the mount
  // effect too, and the error state clears on each async resolution instead.
  function loadTab(target: AdminTab, query?: string) {
    if (target === "restaurants") {
      adminListRestaurants(query)
        .then(({ restaurants: rows }) => {
          setRestaurants(rows);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    } else if (target === "users") {
      adminListUsers(query)
        .then(({ users: rows }) => {
          setUsers(rows);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    } else if (target === "orders") {
      adminListOrders()
        .then(({ orders: rows }) => {
          setOrders(rows);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    } else if (target === "payments") {
      adminListPayments()
        .then(({ payments: rows }) => {
          setPayments(rows);
          setError(null);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    } else {
      listAuditLog()
        .then(({ entries }) => setAuditLog(entries))
        .catch(() => {
          // The panel's own action still succeeded — a stale audit list is non-critical.
        });
    }
  }

  useEffect(() => {
    loadTab("restaurants");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchTab(next: AdminTab) {
    setTab(next);
    setSearch("");
    loadTab(next);
  }

  async function handleSuspendToggle(row: AdminRestaurantRow) {
    setPendingId(row.id);
    setError(null);
    try {
      if (row.isSuspended) {
        await unsuspendRestaurant(row.id);
      } else {
        const reason = window.prompt(`Reason for suspending "${row.name}" (optional):`) ?? undefined;
        await suspendRestaurant(row.id, reason);
      }
      loadTab("restaurants", search || undefined);
      loadTab("audit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(row: AdminRestaurantRow) {
    const confirmName = window.prompt(
      `PERMANENT DELETE of "${row.name}" — all menu, orders, storefronts, and data.\n\nType the business name exactly to confirm:`,
    );
    if (confirmName === null) return;
    setPendingId(row.id);
    setError(null);
    try {
      await adminDeleteRestaurant(row.id, confirmName);
      loadTab("restaurants", search || undefined);
      loadTab("audit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setPendingId(null);
    }
  }

  async function handleUserActiveToggle(row: AdminUserRow) {
    setPendingId(row.id);
    setError(null);
    try {
      await adminSetUserActive(row.id, !row.isActive);
      loadTab("users", search || undefined);
      loadTab("audit");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPendingId(null);
    }
  }

  const searchable = tab === "restaurants" || tab === "users";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={`min-h-10 rounded-full px-4 text-sm font-bold transition ${
              tab === t.id ? "bg-[#171512] text-white" : "border border-[#E7DDCF] bg-white text-[#756B5D] hover:text-[#171512]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {searchable && (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            loadTab(tab, search || undefined);
          }}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "restaurants" ? "Search businesses by name or id…" : "Search users by email, name, or id…"}
            className="min-h-11 w-full max-w-md rounded-2xl border border-[#E7DDCF] bg-[#FFFDF9] px-4 text-sm outline-none focus:border-[#B97824]"
          />
          <button type="submit" className="min-h-11 rounded-2xl bg-[#171512] px-5 text-sm font-bold text-white">
            Search
          </button>
        </form>
      )}

      {error && <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E7DDCF]">
        {tab === "restaurants" && (
          <table className="w-full min-w-[900px] border-collapse bg-white">
            <thead className="border-b border-[#E7DDCF] bg-[#FBF7F1]">
              <tr>
                <th className={thClass}>Business</th>
                <th className={thClass}>Owner</th>
                <th className={thClass}>Type</th>
                <th className={thClass}>Plan</th>
                <th className={thClass}>Orders</th>
                <th className={thClass}>Items</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(restaurants ?? []).map((row) => (
                <tr key={row.id} className="border-b border-[#F0E9DD] last:border-0">
                  <td className={tdClass}>
                    <span className="font-bold">{row.name}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-[#8A7D6C]">{row.id}</span>
                  </td>
                  <td className={tdClass}>{row.ownerEmail ?? "—"}</td>
                  <td className={tdClass}>{row.businessType}</td>
                  <td className={tdClass}>
                    <span
                      className={pillClass(
                        row.subscriptionState === "ACTIVE" ? "ok" : row.subscriptionState === "TRIALING" ? "warn" : "bad",
                      )}
                    >
                      {row.subscriptionState}
                    </span>
                  </td>
                  <td className={tdClass}>{row.orderCount}</td>
                  <td className={tdClass}>{row.menuItemCount}</td>
                  <td className={tdClass}>
                    {row.isSuspended ? (
                      <span className={pillClass("bad")}>Suspended</span>
                    ) : row.isPublished ? (
                      <span className={pillClass("ok")}>Live</span>
                    ) : (
                      <span className={pillClass("muted")}>Unpublished</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pendingId === row.id}
                        onClick={() => handleSuspendToggle(row)}
                        className="min-h-9 rounded-xl border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512] disabled:opacity-50"
                      >
                        {row.isSuspended ? "Unsuspend" : "Suspend"}
                      </button>
                      <button
                        type="button"
                        disabled={pendingId === row.id}
                        onClick={() => handleDelete(row)}
                        className="min-h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "users" && (
          <table className="w-full min-w-[820px] border-collapse bg-white">
            <thead className="border-b border-[#E7DDCF] bg-[#FBF7F1]">
              <tr>
                <th className={thClass}>User</th>
                <th className={thClass}>Role</th>
                <th className={thClass}>Business</th>
                <th className={thClass}>Verified</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Joined</th>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((row) => (
                <tr key={row.id} className="border-b border-[#F0E9DD] last:border-0">
                  <td className={tdClass}>
                    <span className="font-bold">{row.name}</span>
                    <span className="mt-0.5 block text-xs text-[#756B5D]">{row.email}</span>
                  </td>
                  <td className={tdClass}>{row.role}</td>
                  <td className={tdClass}>{row.restaurantName ?? "—"}</td>
                  <td className={tdClass}>{row.emailVerified ? "Yes" : "No"}</td>
                  <td className={tdClass}>
                    {row.isActive ? <span className={pillClass("ok")}>Active</span> : <span className={pillClass("bad")}>Deactivated</span>}
                  </td>
                  <td className={tdClass}>{formatDate(row.createdAt)}</td>
                  <td className={tdClass}>
                    <button
                      type="button"
                      disabled={pendingId === row.id}
                      onClick={() => handleUserActiveToggle(row)}
                      className="min-h-9 rounded-xl border border-[#E7DDCF] bg-white px-3 text-xs font-bold text-[#171512] disabled:opacity-50"
                    >
                      {row.isActive ? "Deactivate" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "orders" && (
          <table className="w-full min-w-[820px] border-collapse bg-white">
            <thead className="border-b border-[#E7DDCF] bg-[#FBF7F1]">
              <tr>
                <th className={thClass}>Order</th>
                <th className={thClass}>Business</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Payment</th>
                <th className={thClass}>Source</th>
                <th className={thClass}>Placed</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((row) => (
                <tr key={row.id} className="border-b border-[#F0E9DD] last:border-0">
                  <td className={`${tdClass} font-mono text-xs`}>{row.id.slice(0, 8)}…</td>
                  <td className={tdClass}>{row.restaurantName}</td>
                  <td className={tdClass}>{formatMoney(row.totalCents)}</td>
                  <td className={tdClass}>{row.status}</td>
                  <td className={tdClass}>
                    <span className={pillClass(row.paymentStatus === "PAID" ? "ok" : "warn")}>{row.paymentStatus}</span>
                  </td>
                  <td className={tdClass}>{row.source}</td>
                  <td className={tdClass}>{formatDate(row.createdAt)}</td>
                </tr>
              ))}
              {orders !== null && orders.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-[#756B5D]">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "payments" && (
          <table className="w-full min-w-[760px] border-collapse bg-white">
            <thead className="border-b border-[#E7DDCF] bg-[#FBF7F1]">
              <tr>
                <th className={thClass}>Payment</th>
                <th className={thClass}>Business</th>
                <th className={thClass}>Provider</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>When</th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((row) => (
                <tr key={row.id} className="border-b border-[#F0E9DD] last:border-0">
                  <td className={`${tdClass} font-mono text-xs`}>{row.id.slice(0, 8)}…</td>
                  <td className={tdClass}>{row.restaurantName}</td>
                  <td className={tdClass}>{row.providerType ?? "—"}</td>
                  <td className={tdClass}>
                    {formatMoney(row.capturedAmountCents || row.authorizedAmountCents)}
                    {row.refundedAmountCents > 0 && (
                      <span className="ml-1 text-xs text-red-700">(-{formatMoney(row.refundedAmountCents)})</span>
                    )}
                  </td>
                  <td className={tdClass}>
                    <span className={pillClass(row.status === "SUCCEEDED" || row.status === "CAPTURED" ? "ok" : "warn")}>{row.status}</span>
                  </td>
                  <td className={tdClass}>{formatDate(row.createdAt)}</td>
                </tr>
              ))}
              {payments !== null && payments.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-[#756B5D]">
                    No payments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tab === "audit" && (
          <table className="w-full min-w-[640px] border-collapse bg-white">
            <thead className="border-b border-[#E7DDCF] bg-[#FBF7F1]">
              <tr>
                <th className={thClass}>Admin</th>
                <th className={thClass}>Action</th>
                <th className={thClass}>Target</th>
                <th className={thClass}>When</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map((entry) => (
                <tr key={entry.id} className="border-b border-[#F0E9DD] last:border-0">
                  <td className={tdClass}>{entry.adminName}</td>
                  <td className={tdClass}>{formatAction(entry.action)}</td>
                  <td className={tdClass}>
                    {entry.targetType} <span className="font-mono text-xs text-[#8A7D6C]">{entry.targetId.slice(0, 8)}…</span>
                  </td>
                  <td className={tdClass}>{formatDate(entry.createdAt)}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-[#756B5D]">
                    No admin activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
