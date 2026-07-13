"use client";

import { useEffect, useState } from "react";
import { PageShell } from "@/components/ui";
import { getMySite, getRestaurant, type Restaurant, type SiteStatus } from "@/lib/api";
import { LaunchCenter } from "./launch-center";

export default function LaunchCenterPage() {
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [siteStatus, setSiteStatus] = useState<SiteStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getRestaurant().then(({ restaurant: loaded }) => loaded),
      getMySite()
        .then(({ site }) => site.status)
        .catch(() => null),
    ])
      .then(([loadedRestaurant, loadedStatus]) => {
        if (cancelled) return;
        setRestaurant(loadedRestaurant);
        setSiteStatus(loadedStatus);
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

  return <LaunchCenter restaurant={restaurant} siteStatus={siteStatus} />;
}
