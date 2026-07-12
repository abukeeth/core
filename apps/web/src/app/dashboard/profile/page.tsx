"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/ui";
import {
  changePassword,
  getMe,
  logoutAllDevices,
  resendVerification,
  updateProfile,
  type PublicUser,
} from "@/lib/api";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [resent, setResent] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then(({ user: loaded }) => {
        if (cancelled) return;
        setUser(loaded);
        setName(loaded.name);
        setPhone(loaded.phone ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const { user: updated } = await updateProfile({ name, phone: phone || null });
      setUser(updated);
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleResendVerification() {
    await resendVerification();
    setResent(true);
  }

  async function handleLogoutAllDevices() {
    setLoggingOutAll(true);
    try {
      await logoutAllDevices();
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOutAll(false);
    }
  }

  return (
    <PageShell maxWidth="2xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Profile</h1>

        {loading && <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>}

        {user && (
          <>
            <div className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 text-sm dark:border-white/[.145] dark:bg-zinc-950">
              <p className="text-zinc-600 dark:text-zinc-400">
                Email: <span className="font-medium text-black dark:text-zinc-50">{user.email}</span>
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                Email verified:{" "}
                {user.emailVerified ? (
                  <span className="font-medium text-green-600">Yes</span>
                ) : (
                  <span className="inline-flex items-center gap-2 font-medium text-amber-600">
                    No
                    {resent ? (
                      "— email sent"
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        className="rounded-full border border-amber-400 px-2 py-0.5 text-xs font-medium dark:border-amber-800"
                      >
                        Resend
                      </button>
                    )}
                  </span>
                )}
              </p>
            </div>

            <form
              onSubmit={handleSaveProfile}
              className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
            >
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Name &amp; phone</h2>
              {profileError && <p className="text-sm text-red-600">{profileError}</p>}
              {profileSaved && <p className="text-sm text-green-600">Saved.</p>}
              <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Name
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Phone
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
                />
              </label>
              <button
                type="submit"
                disabled={profileSaving}
                className="self-start rounded-full bg-foreground px-5 py-2 text-sm text-background disabled:opacity-50"
              >
                {profileSaving ? "Saving…" : "Save"}
              </button>
            </form>

            <form
              onSubmit={handleChangePassword}
              className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950"
            >
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Change password</h2>
              {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
              {passwordSaved && <p className="text-sm text-green-600">Password changed. Other sessions were signed out.</p>}
              <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                Current password
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
                New password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
                />
              </label>
              <button
                type="submit"
                disabled={passwordSaving}
                className="self-start rounded-full bg-foreground px-5 py-2 text-sm text-background disabled:opacity-50"
              >
                {passwordSaving ? "Saving…" : "Change password"}
              </button>
            </form>

            <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
              <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Sessions</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Sign out of every device where you&apos;re currently logged in, including this one.
              </p>
              <button
                type="button"
                onClick={handleLogoutAllDevices}
                disabled={loggingOutAll}
                className="self-start rounded-full border border-red-300 px-5 py-2 text-sm text-red-600 disabled:opacity-50"
              >
                {loggingOutAll ? "Logging out…" : "Log out of all devices"}
              </button>
            </div>
          </>
        )}
    </PageShell>
  );
}
