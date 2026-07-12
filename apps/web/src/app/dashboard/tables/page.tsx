"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { createTable, deleteTable, listTables, regenerateQrToken, updateTable, type Table } from "@/lib/owner-commerce-api";

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    return listTables()
      .then((result) => setTables(result.tables))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tables"));
  }

  useEffect(() => {
    let cancelled = false;
    listTables()
      .then((result) => {
        if (!cancelled) setTables(result.tables);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load tables");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!label) return;
    try {
      await createTable(label);
      setLabel("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table");
    }
  }

  async function handleToggleActive(table: Table) {
    await updateTable(table.id, { isActive: !table.isActive });
    refresh();
  }

  async function handleRegenerate(id: string) {
    await regenerateQrToken(id);
    refresh();
  }

  async function handleDelete(id: string) {
    await deleteTable(id);
    refresh();
  }

  return (
    <PageShell maxWidth="xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Tables (QR ordering)</h1>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            required
            placeholder="Table label (e.g. Table 5)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
          />
          <button type="submit" className="rounded-full bg-foreground px-4 py-2 text-sm text-background">
            Add table
          </button>
        </form>

        <ul className="flex flex-col divide-y divide-black/[.08] rounded-lg border border-black/[.08] bg-white dark:divide-white/[.145] dark:border-white/[.145] dark:bg-zinc-950">
          {tables.map((table) => (
            <li key={table.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium text-black dark:text-zinc-50">
                  {table.label} {!table.isActive && <span className="text-xs text-zinc-500">(inactive)</span>}
                </span>
                <div className="flex gap-2 text-sm">
                  <button type="button" onClick={() => handleToggleActive(table)} className="text-zinc-600 dark:text-zinc-400">
                    {table.isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button type="button" onClick={() => handleRegenerate(table.id)} className="text-zinc-600 dark:text-zinc-400">
                    Regenerate QR
                  </button>
                  <button type="button" onClick={() => handleDelete(table.id)} className="text-red-600">
                    Delete
                  </button>
                </div>
              </div>
              <a
                href={`/order/qr/${table.qrToken}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-zinc-500 hover:underline"
              >
                Scan link: /order/qr/{table.qrToken}
              </a>
            </li>
          ))}
          {tables.length === 0 && <li className="p-4 text-sm text-zinc-500">No tables yet.</li>}
        </ul>
    </PageShell>
  );
}
