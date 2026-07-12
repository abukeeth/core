"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { listPOSProviders, type POSProvider } from "@/lib/owner-commerce-api";

const POS_TYPES = ["SQUARE_POS", "CLOVER_POS", "TOAST", "LIGHTSPEED", "GENERIC"];

export default function POSPage() {
  const [providers, setProviders] = useState<POSProvider[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPOSProviders()
      .then((result) => {
        if (!cancelled) setProviders(result.posProviders);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load POS providers");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <PageShell maxWidth="xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Point of sale</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your existing POS system to sync menus and export completed orders. All providers are coming soon.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-3">
          {POS_TYPES.map((type) => {
            const connected = providers.find((p) => p.providerType === type);
            return (
              <div key={type} className="flex items-center justify-between rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
                <span className="font-medium text-black dark:text-zinc-50">{type.replace(/_/g, " ")}</span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {connected ? connected.status : "Coming soon"}
                </span>
              </div>
            );
          })}
        </div>
    </PageShell>
  );
}
