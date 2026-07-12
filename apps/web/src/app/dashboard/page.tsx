import { PageShell } from "@/components/ui";
import type { AuditLogEntry, PublicUser, Restaurant } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { DashboardOverview } from "./dashboard-overview";
import { AdminPanel } from "./admin-panel";
import { VerifyEmailBanner } from "./verify-email-banner";

async function AdminOverview() {
  const [restaurantsResult, auditLogResult] = await Promise.all([
    serverFetch<{ restaurants: Restaurant[] }>("/api/admin/restaurants"),
    serverFetch<{ entries: AuditLogEntry[] }>("/api/admin/audit-log"),
  ]);

  if (!restaurantsResult.ok) {
    return (
      <div className="min-h-screen bg-[#F7F0E5] p-6 text-sm text-red-700">
        Could not load restaurants.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F0E5] p-4 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-7xl rounded-3xl border border-[#E7DDCF] bg-white p-5 shadow-[0_12px_36px_rgba(48,39,27,0.04)] sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9A6A2F]">Platform administration</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#171512]">OrderVora Admin</h1>
          <p className="mt-2 text-sm text-[#756B5D]">Manage restaurants, suspension status, and audit activity.</p>
        </div>
        <AdminPanel
          initialRestaurants={restaurantsResult.data.restaurants}
          initialAuditLog={auditLogResult.ok ? auditLogResult.data.entries : []}
        />
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const result = await serverFetch<{ user: PublicUser }>("/api/auth/me");
  if (!result.ok) {
    return (
      <PageShell maxWidth="2xl">
        <p className="text-sm text-red-700">Could not load your account. Please refresh.</p>
      </PageShell>
    );
  }

  const { user } = result.data;

  if (user.role === "ADMIN") {
    return <AdminOverview />;
  }

  return (
    <>
      {!user.emailVerified && <VerifyEmailBanner />}
      <DashboardOverview userName={user.name} />
    </>
  );
}
