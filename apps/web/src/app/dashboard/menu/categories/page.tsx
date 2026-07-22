import type { MenuCategory } from "@/lib/api";
import { serverFetch } from "@/lib/server-api";
import { DetailShell } from "@/components/owner-shell";
import { AddCategoryForm, DeleteCategoryButton } from "../category-form";
import { MenuImageUpload } from "../image-upload";

/* Category management — reuses the existing category CRUD + image-upload
 * components (which call router.refresh()), so this is a server component that
 * re-fetches on every mutation. No Figma node exists for this screen; it is
 * styled to the design system and preserves all existing behaviour. */

export default async function MenuCategoriesPage() {
  const result = await serverFetch<{ categories: MenuCategory[] }>("/api/menu/categories");
  const categories = result.ok ? result.data.categories : [];

  return (
    <DetailShell title="Categories" backHref="/dashboard/menu">
      <div className="space-y-4">
        <div className="rounded-[18px] border border-line bg-surface p-4">
          <h2 className="font-display text-[17px] font-medium text-ink">Add a category</h2>
          <div className="mt-2">
            <AddCategoryForm />
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-[18px] border border-line bg-surface px-4 py-8 text-center text-sm text-ink-secondary">No categories yet.</div>
        ) : categories.map((category) => (
          <div key={category.id} className="rounded-[18px] border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-[17px] font-medium text-ink">
                {category.name} <span className="text-xs font-normal text-ink-muted">· {category.items.length} item{category.items.length === 1 ? "" : "s"}</span>
              </h3>
              <DeleteCategoryButton categoryId={category.id} />
            </div>
            <div className="mt-3">
              <MenuImageUpload entity="category" entityId={category.id} imageUrl={category.imageUrl} />
            </div>
          </div>
        ))}
      </div>
    </DetailShell>
  );
}
