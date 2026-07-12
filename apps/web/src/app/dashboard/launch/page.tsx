"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getRestaurant, type Restaurant } from "@/lib/api";
import { LaunchCenter } from "./launch-center";

export default function LaunchCenterPage() {
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

  return <LaunchCenter restaurant={restaurant} />;
}
