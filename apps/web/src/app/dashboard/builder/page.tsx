import type { Restaurant } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { BuilderExperience } from "./builder-experience";

export default async function RestaurantBuilderPage() {
  const result = await serverFetch<{ restaurant: Restaurant }>("/api/restaurants/me");
  const restaurantName = result.ok ? result.data.restaurant.name : "your restaurant";

  return <BuilderExperience restaurantName={restaurantName} />;
}
