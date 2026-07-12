"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  addCartItem,
  createCart,
  getPublicMenu,
  getRestaurantReviews,
  type Cart,
  type PublicMenu,
  type PublicMenuItem,
} from "@/lib/commerce-api";
import { getStoredCartId, setStoredCartId } from "@/lib/cart-storage";

function formatPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

export default function OrderMenuPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = params.restaurantId;

  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<PublicMenuItem | null>(null);
  const [rating, setRating] = useState<{ averageRating: number | null; reviewCount: number } | null>(null);

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

  async function handleQuickAdd(item: PublicMenuItem) {
    if (!cart) return;
    if (item.variants.length > 0 || item.modifierGroups.length > 0) {
      setActiveItem(item);
      return;
    }
    try {
      await addCartItem(cart.id, { menuItemId: item.id, quantity: 1 });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  if (error && !menu) {
    return <p className="p-8 text-sm text-red-600">{error}</p>;
  }

  if (!menu) {
    return <p className="p-8 text-sm text-zinc-600 dark:text-zinc-400">Loading menu…</p>;
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 bg-zinc-50 p-6 pb-24 dark:bg-black">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{menu.restaurant.name}</h1>
          {menu.restaurant.address && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{menu.restaurant.address}</p>
          )}
          {rating && rating.reviewCount > 0 && rating.averageRating !== null && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              ★ {rating.averageRating.toFixed(1)} ({rating.reviewCount} review{rating.reviewCount === 1 ? "" : "s"})
            </p>
          )}
        </header>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {menu.categories.map((category) => (
          <div key={category.id} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{category.name}</h2>
            <ul className="flex flex-col divide-y divide-black/[.08] rounded-lg border border-black/[.08] bg-white dark:divide-white/[.145] dark:border-white/[.145] dark:bg-zinc-950">
              {category.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-black dark:text-zinc-50">{item.name}</span>
                    {item.description && (
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">{item.description}</span>
                    )}
                    <span className="text-sm text-zinc-700 dark:text-zinc-300">${formatPrice(item.priceCents)}</span>
                  </div>
                  <button
                    type="button"
                    disabled={!item.isOrderable || !cart}
                    onClick={() => handleQuickAdd(item)}
                    className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm text-background disabled:opacity-40"
                  >
                    {item.isOrderable ? "Add" : "Unavailable"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {activeItem && cart && (
        <ItemModal
          item={activeItem}
          cartId={cart.id}
          onClose={() => setActiveItem(null)}
          onAdded={() => setActiveItem(null)}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 flex justify-center border-t border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-zinc-950">
        <div className="flex w-full max-w-2xl justify-between">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {cart ? `${cart.items.length} item(s) in cart` : "Loading cart…"}
          </span>
          <Link
            href={`/order/${restaurantId}/cart`}
            className="rounded-full bg-foreground px-5 py-2 text-sm text-background"
          >
            View cart
          </Link>
        </div>
      </div>
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
  onAdded: () => void;
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
        // Clear other selections within the same group.
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
      await addCartItem(cartId, {
        menuItemId: item.id,
        variantId,
        quantity,
        modifierOptionIds: Array.from(selectedOptionIds),
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-white p-6 dark:bg-zinc-950">
        <h3 className="text-lg font-semibold text-black dark:text-zinc-50">{item.name}</h3>

        {item.variants.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Size</span>
            {item.variants.map((v) => (
              <label key={v.id} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="variant"
                  checked={variantId === v.id}
                  onChange={() => setVariantId(v.id)}
                />
                {v.name} {v.priceDeltaCents !== 0 && `(+$${formatPrice(v.priceDeltaCents)})`}
              </label>
            ))}
          </div>
        )}

        {item.modifierGroups.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {group.name} {group.isRequired && "(required)"}
            </span>
            {group.options.map((option) => (
              <label key={option.id} className="flex items-center gap-2 text-sm">
                <input
                  type={group.selectionType === "SINGLE" ? "radio" : "checkbox"}
                  name={group.id}
                  disabled={!option.isAvailable}
                  checked={selectedOptionIds.has(option.id)}
                  onChange={() => toggleOption(group.id, option.id, group.selectionType === "SINGLE")}
                />
                {option.name} {option.priceDeltaCents !== 0 && `(+$${formatPrice(option.priceDeltaCents)})`}
              </label>
            ))}
          </div>
        ))}

        <label className="flex items-center gap-2 text-sm">
          Quantity
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-16 rounded border border-black/[.08] px-2 py-1 dark:border-white/[.145] dark:bg-black"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-zinc-600 dark:text-zinc-400">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting}
            className="rounded-full bg-foreground px-5 py-2 text-sm text-background disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add to cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
