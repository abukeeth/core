"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getRestaurant, type Restaurant } from "@/lib/api";
import { TestOrderFlow } from "../test-order-flow";

export default function TestOrderPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRestaurant()
      .then(({ restaurant: loaded }) => {
        if (!cancelled) setRestaurant(loaded);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !restaurant) {
    return (
      <PageShell maxWidth="lg">
        <p className="text-sm text-[#756B5D]">Loading…</p>
      </PageShell>
    );
  }

  return <TestOrderFlow restaurant={restaurant} />;
}
