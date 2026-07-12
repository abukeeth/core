"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { inviteStaff, listStaff, setStaffActive, type StaffMember } from "@/lib/api";

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { staff: loaded } = await listStaff();
        if (!cancelled) setStaff(loaded);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load staff");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setInviting(true);
    setInviteError(null);
    try {
      await inviteStaff(email, password, name);
      const { staff: refreshed } = await listStaff();
      setStaff(refreshed);
      setName("");
      setEmail("");
      setPassword("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to invite staff member");
    } finally {
      setInviting(false);
    }
  }

  async function handleToggleActive(member: StaffMember) {
    try {
      const { staff: updated } = await setStaffActive(member.id, !member.isActive);
      setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update staff member");
    }
  }

  return (
    <PageShell maxWidth="2xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Staff</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Invite staff accounts to help run orders, the kitchen queue, and deliveries. Deactivating a staff member
          immediately signs them out and blocks further sign-ins, without deleting their account or history.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <form
          onSubmit={handleInvite}
          className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
        >
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Invite a staff member</h2>
          {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
            />
            <input
              type="password"
              placeholder="Temporary password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
            />
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="self-start rounded-full bg-foreground px-5 py-2 text-sm text-background disabled:opacity-50"
          >
            {inviting ? "Inviting…" : "Invite"}
          </button>
        </form>

        <div className="flex flex-col divide-y divide-black/[.08] rounded-lg border border-black/[.08] bg-white dark:divide-white/[.145] dark:border-white/[.145] dark:bg-zinc-950">
          {loading && <p className="p-4 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>}
          {!loading && staff.length === 0 && (
            <p className="p-4 text-sm text-zinc-600 dark:text-zinc-400">No staff members yet.</p>
          )}
          {staff.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-black dark:text-zinc-50">{member.name}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{member.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs font-medium ${member.isActive ? "text-green-600" : "text-zinc-500"}`}
                >
                  {member.isActive ? "Active" : "Deactivated"}
                </span>
                <button
                  type="button"
                  onClick={() => handleToggleActive(member)}
                  className={`rounded-full px-4 py-1.5 text-sm ${
                    member.isActive
                      ? "border border-red-300 text-red-600"
                      : "bg-foreground text-background"
                  }`}
                >
                  {member.isActive ? "Deactivate" : "Reactivate"}
                </button>
              </div>
            </div>
          ))}
        </div>
    </PageShell>
  );
}
