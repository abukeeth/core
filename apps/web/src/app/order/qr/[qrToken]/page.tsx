"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { bindCartToTable, createCart, resolveTableByQrToken } from "@/lib/commerce-api";
import { setStoredCartId } from "@/lib/cart-storage";

/**
 * Dine-in entry point (Sprint 07 §18) — a diner scans a table's QR code,
 * which resolves server-side to its restaurant/table (never trusting a
 * client-supplied table id directly), then bootstraps a DINE_IN cart
 * pre-associated with that table before landing on the live menu.
 */
export default function QrTableLandingPage() {
  const params = useParams<{ qrToken: string }>();
  const qrToken = params.qrToken;
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveTableByQrToken(qrToken)
      .then(({ table }) =>
        createCart(table.restaurantId, "DINE_IN").then(({ cart }) =>
          bindCartToTable(cart.id, qrToken).then(({ cart: bound }) => {
            if (cancelled) return;
            setStoredCartId(table.restaurantId, bound.id);
            router.replace(`/order/${table.restaurantId}`);
          }),
        ),
      )
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "This QR code is no longer valid");
      });
    return () => {
      cancelled = true;
    };
  }, [qrToken, router]);

  if (error) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  return <p className="p-8 text-sm text-zinc-600 dark:text-zinc-400">Loading your table…</p>;
}
