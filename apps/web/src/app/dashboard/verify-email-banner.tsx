"use client";

import { useState } from "react";
import { resendVerification } from "@/lib/api";

export function VerifyEmailBanner() {
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      await resendVerification();
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the verification email.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6 lg:px-10">
      <span className="font-medium">
        {sent ? "Verification email sent — check your inbox." : error ? error : "Please verify your email address."}
      </span>
      {!sent && (
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting}
          className="whitespace-nowrap rounded-full border border-amber-400 bg-white px-3 py-1 text-xs font-bold disabled:opacity-50"
        >
          {submitting ? "Sending…" : error ? "Try again" : "Resend email"}
        </button>
      )}
    </div>
  );
}
