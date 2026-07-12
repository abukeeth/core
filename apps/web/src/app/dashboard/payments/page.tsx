"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import {
  connectPaymentProvider,
  disconnectPaymentProvider,
  listPaymentProviders,
  updatePaymentProviderPriority,
  type PaymentProvider,
} from "@/lib/owner-commerce-api";

const PROVIDER_TYPES = ["STRIPE", "CLOVER", "SQUARE", "AUTHORIZE_NET", "ADYEN", "FISERV"];

export default function PaymentsPage() {
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [publicKeys, setPublicKeys] = useState<Record<string, string>>({});

  function refresh() {
    return listPaymentProviders()
      .then((result) => setProviders(result.providers))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load providers"));
  }

  useEffect(() => {
    let cancelled = false;
    listPaymentProviders()
      .then((result) => {
        if (!cancelled) setProviders(result.providers);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load providers");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleConnect(type: string) {
    const creds = credentials[type];
    if (!creds) return;
    try {
      await connectPaymentProvider(type, creds, undefined, undefined, publicKeys[type] || undefined);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect provider");
    }
  }

  async function handleDisconnect(type: string) {
    try {
      await disconnectPaymentProvider(type);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect provider");
    }
  }

  async function handlePriority(type: string, priority: number) {
    try {
      await updatePaymentProviderPriority(type, priority);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update priority");
    }
  }

  function findConnected(type: string) {
    return providers.find((p) => p.providerType === type && p.status === "CONNECTED");
  }

  return (
    <PageShell maxWidth="2xl">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Payment providers</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect one or more of your own payment provider accounts (BYOP). Orders automatically fail over to the
          next-priority connected provider if one fails.
        </p>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-3">
          {PROVIDER_TYPES.map((type) => {
            const connected = findConnected(type);
            const implemented = type === "STRIPE";
            return (
              <div key={type} className="flex flex-col gap-2 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-black dark:text-zinc-50">
                    {type} {!implemented && <span className="text-xs text-zinc-500">(coming soon)</span>}
                  </span>
                  {connected && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-950 dark:text-green-400">
                      Connected
                    </span>
                  )}
                </div>

                {connected ? (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Priority
                      <input
                        type="number"
                        defaultValue={connected.priority}
                        onBlur={(e) => handlePriority(type, Number(e.target.value))}
                        className="w-16 rounded border border-black/[.08] px-2 py-1 dark:border-white/[.145] dark:bg-black"
                      />
                    </label>
                    <button type="button" onClick={() => handleDisconnect(type)} className="text-sm text-red-600">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  implemented && (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="Secret key / credentials"
                          value={credentials[type] ?? ""}
                          onChange={(e) => setCredentials((prev) => ({ ...prev, [type]: e.target.value }))}
                          className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
                        />
                        <button
                          type="button"
                          onClick={() => handleConnect(type)}
                          className="rounded-full bg-foreground px-4 py-2 text-sm text-background"
                        >
                          Connect
                        </button>
                      </div>
                      {type === "STRIPE" && (
                        <input
                          type="text"
                          placeholder="Publishable key (pk_..., required for card/wallet checkout)"
                          value={publicKeys[type] ?? ""}
                          onChange={(e) => setPublicKeys((prev) => ({ ...prev, [type]: e.target.value }))}
                          className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-black"
                        />
                      )}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
    </PageShell>
  );
}
