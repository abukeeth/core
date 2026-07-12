import { PageShell } from "@/components/ui";
import type { HoursRowInput, Restaurant } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { HoursEditor } from "./hours-editor";
import { RestaurantForm } from "./restaurant-form";

export default async function RestaurantPage() {
  const result = await serverFetch<{ restaurant: Restaurant }>("/api/restaurants/me");
  const restaurant = result.ok ? result.data.restaurant : null;

  const hoursResult = restaurant ? await serverFetch<{ hours: HoursRowInput[] }>("/api/restaurants/me/hours") : null;
  const initialHours = hoursResult?.ok ? hoursResult.data.hours : [];

  return (
    <PageShell maxWidth="lg">
        <RestaurantForm restaurant={restaurant} />
        {restaurant && <HoursEditor initialHours={initialHours} />}
    </PageShell>
  );
}
