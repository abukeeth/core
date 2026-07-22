import type { MenuCategory } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { ProductsView } from "./products-view";

export default async function MenuPage() {
  const result = await serverFetch<{ categories: MenuCategory[] }>("/api/menu/categories");
  const categories = result.ok ? result.data.categories : [];
  return <ProductsView categories={categories} loadError={!result.ok} />;
}
