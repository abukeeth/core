import type { ModifierGroup } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { DetailShell } from "@/components/owner-shell";
import { ModifierGroupsManager } from "../modifier-groups-manager";

/* Modifier-group management — reuses the existing ModifierGroupsManager (which
 * calls router.refresh()), so this is a server component that re-fetches on
 * mutation. Owner attaches these groups to individual products in the Product
 * Editor. Preserves all existing modifier CRUD. */

export default async function MenuModifiersPage() {
  const result = await serverFetch<{ modifierGroups: ModifierGroup[] }>("/api/restaurants/me/modifier-groups");
  const modifierGroups = result.ok ? result.data.modifierGroups : [];

  return (
    <DetailShell title="Modifiers" backHref="/dashboard/menu">
      <p className="text-sm text-ink-secondary">Create option groups (e.g. “Cheese choice”, “Add-ons”) here, then attach them to products from each product’s editor.</p>
      <div className="mt-4">
        <ModifierGroupsManager modifierGroups={modifierGroups} />
      </div>
    </DetailShell>
  );
}
