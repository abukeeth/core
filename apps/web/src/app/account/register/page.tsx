"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { customerRegister } from "@/lib/commerce-api";

export default function CustomerRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await customerRegister(email, password, name);
      router.push("/account");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-canvas">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-line bg-surface p-8"
      >
        <h1 className="text-xl font-semibold text-ink font-display">Create an account</h1>

        {error && <p className="text-sm text-danger">{error}</p>}

        <label className="flex flex-col gap-1 text-sm text-ink-secondary">
          Name
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-line px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-secondary">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-line px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-ink-secondary">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-line px-3 py-2"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-full bg-brand px-5 py-2 text-white disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create account"}
        </button>

        <p className="text-sm text-ink-secondary">
          Already have an account?{" "}
          <Link href="/account/login" className="font-semibold text-brand">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
