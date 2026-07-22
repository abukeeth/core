"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  addCartItem,
  createCart,
  getPublicMenu,
  getRestaurantReviews,
  setCartFulfillment,
  type Cart,
  type FulfillmentType,
  type PublicMenu,
  type PublicMenuItem,
} from "@/lib/commerce-api";
import { getStoredCartId, setStoredCartId } from "@/lib/cart-storage";

/* Customer storefront home — Figma "Customer Storefront V1 / Home" (node 102:3),
 * mapped to the OrderVora warm palette. All ordering logic (menu, cart,
 * quick-add, variant/modifier ItemModal) is preserved unchanged; the Pickup/
 * Delivery toggle is wired to the real setCartFulfillment API. Public menu items
 * carry no image, so cards use an icon placeholder (no fabricated photos). */

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function Glyph({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const ICON_SEARCH = "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3-3";
const ICON_USER = "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21c.5-5 3-7 8-7s7.5 2 8 7";
const ICON_BAG = "M6 8h12l-1 12H7L6 8ZM9 8a3 3 0 0 1 6 0";

export default function OrderMenuPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = params.restaurantId;

  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<PublicMenuItem | null>(null);
  const [rating, setRating] = useState<{ averageRating: number | null; reviewCount: number } | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const menuResult = await getPublicMenu(restaurantId);
        if (cancelled) return;
        setMenu(menuResult);

        const storedCartId = getStoredCartId(restaurantId);
        if (storedCartId) {
          setStoredCartId(restaurantId, storedCartId);
        }
        const { cart: activeCart } = await createCart(restaurantId);
        if (cancelled) return;
        setStoredCartId(restaurantId, activeCart.id);
        setCart(activeCart);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load menu");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    getRestaurantReviews(restaurantId)
      .then((result) => setRating({ averageRating: result.averageRating, reviewCount: result.reviewCount }))
      .catch(() => undefined);
  }, [restaurantId]);

  async function setFulfillment(type: FulfillmentType) {
    if (!cart || cart.fulfillmentType === type) return;
    try {
      const { cart: updated } = await setCartFulfillment(cart.id, { fulfillmentType: type });
      setCart(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update fulfillment");
    }
  }

  async function handleQuickAdd(item: PublicMenuItem) {
    if (!cart) return;
    if (item.variants.length > 0 || item.modifierGroups.length > 0) {
      setActiveItem(item);
      return;
    }
    try {
      const { item: added } = await addCartItem(cart.id, { menuItemId: item.id, quantity: 1 });
      setCart((c) => (c ? { ...c, items: [...c.items, added] } : c));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  const subtotalCents = useMemo(
    () => (cart ? cart.items.reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0) : 0),
    [cart],
  );
  const cartCount = cart ? cart.items.reduce((n, it) => n + it.quantity, 0) : 0;

  const visibleCategories = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((c) => ({ ...c, items: c.items.filter((i) => (q ? i.name.toLowerCase().includes(q) : true)) }))
      .filter((c) => (activeCat === "all" || c.id === activeCat) && c.items.length > 0);
  }, [menu, query, activeCat]);

  if (error && !menu) return <div className="p-8 text-sm text-danger">{error}</div>;
  if (!menu) return <div className="p-8 text-sm text-ink-secondary">Loading menu…</div>;

  return (
    <div className="flex flex-1 flex-col bg-canvas text-ink">
      <div className="mx-auto w-full max-w-2xl px-5 pb-28 pt-4">
        {/* Store header */}
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[16px] bg-brand-soft font-display text-lg font-semibold text-brand">
            {menu.restaurant.name.trim()[0]?.toUpperCase() ?? "O"}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[19px] font-semibold leading-[25px] text-ink">{menu.restaurant.name}</h1>
            <p className="truncate text-xs text-ink-muted">
              {rating && rating.reviewCount > 0 && rating.averageRating !== null
                ? `★ ${rating.averageRating.toFixed(1)} · ${rating.reviewCount} review${rating.reviewCount === 1 ? "" : "s"}`
                : menu.restaurant.address ?? "Order direct"}
            </p>
          </div>
          <Link href="/account" aria-label="Your account" className="flex size-[42px] items-center justify-center rounded-[14px] border border-line bg-surface text-ink">
            <Glyph d={ICON_USER} />
          </Link>
        </div>

        {/* Fulfillment toggle */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-[16px] border border-line bg-surface p-1">
          {(["PICKUP", "DELIVERY"] as const).map((type) => (
            <button key={type} type="button" onClick={() => setFulfillment(type)}
              className={`rounded-[12px] py-2.5 text-sm font-semibold transition ${cart?.fulfillmentType === type ? "bg-brand text-white" : "text-ink-secondary"}`}>
              {type === "PICKUP" ? "Pickup" : "Delivery"}
            </button>
          ))}
        </div>

        {/* Search */}
        <label className="mt-3 flex items-center gap-2.5 rounded-[16px] border border-line bg-surface px-3.5 py-3">
          <span className="text-ink-muted"><Glyph d={ICON_SEARCH} className="h-[18px] w-[18px]" /></span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
        </label>

        {/* Category chips */}
        {menu.categories.length > 0 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setActiveCat("all")}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${activeCat === "all" ? "bg-brand-soft text-brand" : "border border-line bg-surface text-ink-secondary"}`}>All</button>
            {menu.categories.map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveCat(c.id)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${activeCat === c.id ? "bg-brand-soft text-brand" : "border border-line bg-surface text-ink-secondary"}`}>{c.name}</button>
            ))}
          </div>
        )}

        {error && <div className="mt-4 rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

        {/* Menu */}
        {visibleCategories.length === 0 ? (
          <div className="mt-6 rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">No items match your search.</div>
        ) : visibleCategories.map((category) => (
          <section key={category.id} className="mt-6">
            <h2 className="font-display text-[19px] font-semibold leading-[25px] text-ink">{category.name}</h2>
            <div className="mt-3 space-y-2.5">
              {category.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-[18px] border border-line bg-surface p-3">
                  <span className="flex size-14 shrink-0 items-center justify-center rounded-[14px] bg-subtle text-ink-muted"><Glyph d={ICON_BAG} className="h-6 w-6" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[17px] font-medium leading-[23px] text-ink">{item.name}</p>
                    {item.description && <p className="line-clamp-2 text-xs text-ink-secondary">{item.description}</p>}
                    <p className="mt-0.5 text-sm font-semibold text-ink">{money(item.priceCents)}</p>
                  </div>
                  <button type="button" disabled={!item.isOrderable || !cart} onClick={() => handleQuickAdd(item)}
                    className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
                    {item.isOrderable ? "Add" : "Sold out"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {activeItem && cart && (
        <ItemModal item={activeItem} cartId={cart.id} onClose={() => setActiveItem(null)}
          onAdded={(added) => { setCart((c) => (c ? { ...c, items: [...c.items, added] } : c)); setActiveItem(null); }} />
      )}

      {/* Cart bar */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <Link href={`/order/${restaurantId}/cart`} className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-[16px] bg-brand px-4 py-3.5 text-white">
            <span className="text-sm font-semibold">{cartCount} item{cartCount === 1 ? "" : "s"} · View cart</span>
            <span className="font-display text-[17px] font-semibold">{money(subtotalCents)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function ItemModal({
  item,
  cartId,
  onClose,
  onAdded,
}: {
  item: PublicMenuItem;
  cartId: string;
  onClose: () => void;
  onAdded: (added: Awaited<ReturnType<typeof addCartItem>>["item"]) => void;
}) {
  const [variantId, setVariantId] = useState<string | undefined>(
    item.variants.find((v) => v.isDefault)?.id ?? item.variants[0]?.id,
  );
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleOption(groupId: string, optionId: string, single: boolean) {
    setSelectedOptionIds((prev) => {
      const next = new Set(prev);
      if (single) {
        for (const group of item.modifierGroups) {
          if (group.id === groupId) {
            for (const opt of group.options) next.delete(opt.id);
          }
        }
        next.add(optionId);
      } else if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        next.add(optionId);
      }
      return next;
    });
  }

  async function handleAdd() {
    setSubmitting(true);
    setError(null);
    try {
      const { item: added } = await addCartItem(cartId, {
        menuItemId: item.id,
        variantId,
        quantity,
        modifierOptionIds: Array.from(selectedOptionIds),
      });
      onAdded(added);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-[24px] bg-surface p-6 sm:rounded-[24px]">
        <h3 className="font-display text-[19px] font-semibold text-ink">{item.name}</h3>

        {item.variants.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink">Size</span>
            {item.variants.map((v) => (
              <label key={v.id} className="flex items-center gap-2.5 text-sm text-ink">
                <input type="radio" name="variant" className="accent-[color:var(--ov-brand)]" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                {v.name} {v.priceDeltaCents !== 0 && `(+${money(v.priceDeltaCents)})`}
              </label>
            ))}
          </div>
        )}

        {item.modifierGroups.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-ink">{group.name} {group.isRequired && <span className="text-ink-muted">(required)</span>}</span>
            {group.options.map((option) => (
              <label key={option.id} className="flex items-center gap-2.5 text-sm text-ink">
                <input type={group.selectionType === "SINGLE" ? "radio" : "checkbox"} name={group.id} className="accent-[color:var(--ov-brand)]"
                  disabled={!option.isAvailable} checked={selectedOptionIds.has(option.id)}
                  onChange={() => toggleOption(group.id, option.id, group.selectionType === "SINGLE")} />
                {option.name} {option.priceDeltaCents !== 0 && `(+${money(option.priceDeltaCents)})`}
              </label>
            ))}
          </div>
        ))}

        <label className="flex items-center gap-3 text-sm font-semibold text-ink">
          Quantity
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-16 rounded-[10px] border border-line bg-surface px-2 py-1.5 text-ink outline-none focus:border-brand" />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="mt-1 flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-[14px] border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink">Cancel</button>
          <button type="button" onClick={handleAdd} disabled={submitting} className="flex-1 rounded-[14px] bg-brand px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {submitting ? "Adding…" : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
