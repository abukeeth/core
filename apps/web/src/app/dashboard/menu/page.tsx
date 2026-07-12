import { PageShell } from "@/components/ui";
import type { MenuCategory, ModifierGroup } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { AddCategoryForm, DeleteCategoryButton } from "./category-form";
import { AddItemForm, ItemRow } from "./menu-item-form";
import { ModifierGroupsManager } from "./modifier-groups-manager";

export default async function MenuPage() {
  const result = await serverFetch<{ categories: MenuCategory[] }>("/api/menu/categories");
  const categories = result.ok ? result.data.categories : [];

  const modifierGroupsResult = result.ok
    ? await serverFetch<{ modifierGroups: ModifierGroup[] }>("/api/restaurants/me/modifier-groups")
    : null;
  const modifierGroups = modifierGroupsResult?.ok ? modifierGroupsResult.data.modifierGroups : [];

  return (
    <PageShell maxWidth="2xl">
        {!result.ok && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Set up your restaurant first before adding a menu.
          </p>
        )}

        {result.ok && (
          <>
            <div className="rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
              <h2 className="mb-3 text-sm font-semibold text-black dark:text-zinc-50">Add a category</h2>
              <AddCategoryForm />
            </div>

            {categories.map((category) => (
              <div
                key={category.id}
                className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{category.name}</h2>
                  <DeleteCategoryButton categoryId={category.id} />
                </div>

                <ul className="flex flex-col divide-y divide-black/[.08] dark:divide-white/[.145]">
                  {category.items.map((item) => (
                    <ItemRow key={item.id} item={item} modifierGroups={modifierGroups} />
                  ))}
                </ul>

                <AddItemForm categoryId={category.id} />
              </div>
            ))}

            <ModifierGroupsManager modifierGroups={modifierGroups} />
          </>
        )}
    </PageShell>
  );
}
