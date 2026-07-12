"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCategory, deleteCategory } from "@/lib/api";

export function AddCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createCategory(name);
      setName("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        New category
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border border-black/[.08] px-3 py-2 dark:border-white/[.145] dark:bg-black"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-full bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
      >
        Add
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}

export function DeleteCategoryButton({ categoryId }: { categoryId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    await deleteCategory(categoryId).finally(() => setSubmitting(false));
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={submitting}
      className="text-sm text-red-600 disabled:opacity-50"
    >
      Delete category
    </button>
  );
}
