"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    await logout().finally(() => setSubmitting(false));
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="rounded-full border border-black/[.08] px-5 py-2 text-sm disabled:opacity-50 dark:border-white/[.145]"
    >
      {submitting ? "Logging out..." : "Log out"}
    </button>
  );
}
