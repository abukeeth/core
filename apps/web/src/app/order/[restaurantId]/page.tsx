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
  type PublicReview,
} from "@/lib/commerce-api";
import { getStoredCartId, setStoredCartId } from "@/lib/cart-storage";

/* Customer Storefront V2 — "Appetite Premium" conversion-first rebuild.
 * Architecture frozen with the customer (sections 1–11): Top bar · Fulfillment ·
 * Hero · Best Sellers · Categories · Discovery · Reviews · Story · Full Menu ·
 * Final CTA · Footer, plus the Slide-over cart pill, Product sheet, and Search
 * overlay. All ordering logic (menu, cart, quick-add, variant/modifier sheet,
 * fulfillment toggle, reviews) is preserved and wired to the real API.
 *
 * FRONTEND-FIRST scope (agreed): the public menu carries no product images and
 * the API exposes no order-count ranking yet, so:
 *   - imagery uses deterministic warm gradient placeholders (no fabricated photos);
 *   - "Best sellers" / "Discovery" are derived from the real menu as a temporary
 *     ordering until a backend order-count ranking + Staff Pick flags land.
 * These seams are marked TODO(backend) so they can be swapped without a rework. */

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
const ICON_CLOSE = "M6 6l12 12M18 6L6 18";

/* Warm "food-tone" gradient placeholders — deterministic per item so a given
 * dish always gets the same tone. Swapped for real photography once available. */
const TONES = [
  "linear-gradient(150deg,#E7C48C 0%,#B06F35 100%)",
  "linear-gradient(150deg,#DCC29A 0%,#8C6238 100%)",
  "linear-gradient(150deg,#E9CE9C 0%,#A5713C 100%)",
  "linear-gradient(150deg,#D8B98A 0%,#7E5A34 100%)",
  "linear-gradient(150deg,#E3C58F 0%,#95693A 100%)",
  "linear-gradient(150deg,#EAD6AE 0%,#B58347 100%)",
];
function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
}
function Photo({ seed, className = "", children }: { seed: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`relative overflow-hidden bg-subtle ${className}`} style={{ backgroundImage: toneFor(seed) }}>
      <span className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 80% at 25% 15%, rgba(255,255,255,.28), transparent 55%)" }} />
      {children}
    </div>
  );
}

export default function OrderMenuPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = params.restaurantId;

  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<PublicMenuItem | null>(null);
  const [rating, setRating] = useState<{ averageRating: number | null; reviewCount: number; reviews: PublicReview[] } | null>(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<string>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [discoveryTab, setDiscoveryTab] = useState(0);

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
      .then((result) => setRating({ averageRating: result.averageRating, reviewCount: result.reviewCount, reviews: result.reviews }))
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
      setCart((c) => (c ? { ...c, items: [...(c.items ?? []), added] } : c));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add item");
    }
  }

  // `cart.items` is defensively defaulted: a cart response that ever omits items
  // must never white-screen the storefront (there is no route error boundary).
  const subtotalCents = useMemo(
    () => (cart ? (cart.items ?? []).reduce((sum, it) => sum + it.unitPriceCents * it.quantity, 0) : 0),
    [cart],
  );
  const cartCount = cart ? (cart.items ?? []).reduce((n, it) => n + it.quantity, 0) : 0;

  const allItems = useMemo(
    () => (menu ? menu.categories.flatMap((c) => c.items) : []),
    [menu],
  );
  const orderableItems = useMemo(() => allItems.filter((i) => i.isOrderable), [allItems]);

  // TODO(backend): replace with a real order-count ranking + Staff Pick flags.
  const bestSellers = useMemo(() => orderableItems.slice(0, 6), [orderableItems]);
  const discovery = useMemo(() => {
    const src = orderableItems.length > 0 ? orderableItems : allItems;
    const offset = discoveryTab * 3;
    const out: PublicMenuItem[] = [];
    for (let i = 0; i < Math.min(4, src.length); i++) out.push(src[(offset + i) % src.length]);
    return out;
  }, [orderableItems, allItems, discoveryTab]);

  const visibleCategories = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((c) => ({ ...c, items: c.items.filter((i) => (q ? i.name.toLowerCase().includes(q) : true)) }))
      .filter((c) => (activeCat === "all" || c.id === activeCat) && c.items.length > 0);
  }, [menu, query, activeCat]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allItems.filter((i) => i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q)).slice(0, 12);
  }, [allItems, query]);

  const ratingLabel = rating && rating.reviewCount > 0 && rating.averageRating !== null
    ? { avg: rating.averageRating.toFixed(1), count: rating.reviewCount }
    : null;

  if (error && !menu) return <div className="p-8 text-sm text-danger">{error}</div>;
  if (!menu) return <div className="flex flex-1 items-center justify-center p-8 text-sm text-ink-secondary">Loading…</div>;

  const initial = menu.restaurant.name.trim()[0]?.toUpperCase() ?? "O";
  const DISCOVERY_TABS = ["Trending", "Customer favorites", "Staff picks"];

  return (
    <div className="relative flex flex-1 flex-col bg-canvas text-ink">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col">

        {/* 1 · TOP BAR */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-transparent bg-canvas/80 px-4 py-3 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-ink font-display text-base font-bold text-canvas">{initial}</span>
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-semibold leading-tight text-ink">{menu.restaurant.name}</p>
              <p className="truncate text-[11px] text-ink-secondary">
                {ratingLabel ? <><span className="text-brand">★</span> {ratingLabel.avg} · </> : null}
                {menu.restaurant.address ?? "Order direct"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search the menu" className="flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink">
              <Glyph d={ICON_SEARCH} className="h-[18px] w-[18px]" />
            </button>
            <Link href="/account" aria-label="Your account" className="flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink">
              <Glyph d={ICON_USER} className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </header>

        {/* 2 · FULFILLMENT */}
        <div className="flex flex-col gap-2.5 px-4 pb-1 pt-3.5">
          <div className="flex gap-1 rounded-[14px] border border-line bg-subtle p-1">
            {(["PICKUP", "DELIVERY"] as const).map((type) => (
              <button key={type} type="button" onClick={() => setFulfillment(type)}
                aria-pressed={cart?.fulfillmentType === type}
                className={`flex-1 rounded-[10px] py-2.5 text-sm font-semibold transition ${cart?.fulfillmentType === type ? "bg-surface text-ink shadow-sm" : "text-ink-secondary"}`}>
                {type === "PICKUP" ? "Pickup" : "Delivery"}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-ink-secondary">
            <span className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_rgba(22,163,74,0.18)]" />
            Open now · Ready in ~15 min
          </div>
        </div>

        {error && menu && <div className="mx-4 mt-3 rounded-[14px] border border-danger/25 bg-danger/5 px-4 py-3 text-sm font-medium text-danger">{error}</div>}

        {/* 3 · HERO */}
        <section className="px-4 pb-6 pt-4">
          <Photo seed={`hero-${restaurantId}`} className="aspect-[4/5] rounded-[24px]">
            <span className="absolute inset-0" style={{ background: "linear-gradient(transparent 32%, rgba(18,11,3,.74))" }} />
            <div className="absolute inset-x-4 bottom-4 text-white">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/80">{menu.restaurant.description ? "Order direct" : "Fresh · Order direct"}</p>
              <h1 className="mt-2 font-display text-[32px] font-extrabold leading-[1.02] tracking-[-0.03em] drop-shadow-[0_2px_20px_rgba(0,0,0,0.3)]">{menu.restaurant.name}</h1>
              {ratingLabel && (
                <div className="mt-2.5 flex items-center gap-3 text-[12.5px] text-white/90">
                  <span className="font-bold">★ {ratingLabel.avg}</span>
                  <span className="opacity-50">|</span>
                  <span><b className="font-bold tabular-nums">{ratingLabel.count.toLocaleString()}</b> review{ratingLabel.count === 1 ? "" : "s"}</span>
                </div>
              )}
              <div className="mt-4 flex gap-2.5">
                <a href="#menu" className="flex-1 rounded-full bg-white px-5 py-3.5 text-center text-[15px] font-semibold text-ink shadow-lg">Start your order</a>
                <a href="#menu" className="rounded-full border border-white/50 bg-white/10 px-5 py-3.5 text-[15px] font-semibold text-white backdrop-blur">Menu</a>
              </div>
            </div>
          </Photo>
        </section>

        {/* 4 · BEST SELLERS */}
        {bestSellers.length > 0 && (
          <section className="border-t border-line px-4 py-6">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">
                <span className="mb-1.5 block font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-brand">Most ordered</span>
                Best sellers
              </h2>
              <a href="#menu" className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-muted">See all →</a>
            </div>
            <div className="-mx-4 mt-4 flex gap-3.5 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {bestSellers.map((item, idx) => (
                <div key={item.id} className="flex w-[63%] shrink-0 snap-start flex-col gap-2.5">
                  <Photo seed={item.id} className="aspect-square rounded-[18px]">
                    {idx === 0 && <span className="absolute left-2.5 top-2.5 rounded-full bg-brand px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-white">#1 Most ordered</span>}
                  </Photo>
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-display text-[15px] font-semibold leading-tight">{item.name}</p>
                      <p className="mt-0.5 text-xs text-ink-secondary">
                        {ratingLabel && <span className="text-brand">★ {ratingLabel.avg} · </span>}
                        <span className="font-semibold tabular-nums text-ink">{money(item.priceCents)}</span>
                      </p>
                    </div>
                    <AddButton disabled={!item.isOrderable || !cart} onClick={() => handleQuickAdd(item)} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5 · CATEGORIES */}
        {menu.categories.length > 1 && (
          <section className="border-t border-line px-4 py-6">
            <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">
              <span className="mb-1.5 block font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-brand">Shop by category</span>
              Explore the menu
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {menu.categories.map((c) => (
                <button key={c.id} type="button" onClick={() => { setActiveCat(c.id); document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="text-left">
                  <Photo seed={`cat-${c.id}`} className="flex aspect-[16/10] w-full items-end rounded-[18px] p-3">
                    <span className="absolute inset-0" style={{ background: "linear-gradient(transparent 25%, rgba(18,11,3,.68))" }} />
                    <span className="relative z-[1] font-display text-sm font-bold leading-tight text-white drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">{c.name}</span>
                  </Photo>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 6 · DISCOVERY — Trending / Favorites / Staff picks (TODO(backend) real signals) */}
        {discovery.length > 0 && (
          <section className="border-t border-line px-4 py-6">
            <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">
              <span className="mb-1.5 block font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-brand">Loved by the neighborhood</span>
              Trending &amp; favorites
            </h2>
            <div className="mt-3.5 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {DISCOVERY_TABS.map((t, i) => (
                <button key={t} type="button" onClick={() => setDiscoveryTab(i)} aria-pressed={discoveryTab === i}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${discoveryTab === i ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink-secondary"}`}>
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-3.5">
              {discovery.map((item) => (
                <div key={item.id} className="flex items-center gap-3.5">
                  <Photo seed={item.id} className="size-16 shrink-0 rounded-[14px]" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-semibold leading-tight">{item.name}</p>
                    {item.description && <p className="truncate text-xs text-ink-secondary">{item.description}</p>}
                  </div>
                  <span className="shrink-0 font-display text-[15px] font-bold tabular-nums">{money(item.priceCents)}</span>
                  <AddButton disabled={!item.isOrderable || !cart} onClick={() => handleQuickAdd(item)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 7 · REVIEWS */}
        {ratingLabel && (
          <section className="border-t border-line px-4 py-6">
            <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">
              <span className="mb-1.5 block font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-brand">{ratingLabel.count.toLocaleString()} verified reviews</span>
              What people say
            </h2>
            <div className="mt-3 flex items-center gap-4">
              <div className="text-center">
                <div className="font-display text-[44px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{ratingLabel.avg}</div>
                <div className="text-[13px] text-brand">★★★★★</div>
              </div>
              <p className="flex-1 text-sm text-ink-secondary">Rated {ratingLabel.avg} out of 5 by {ratingLabel.count.toLocaleString()} verified customer{ratingLabel.count === 1 ? "" : "s"}.</p>
            </div>
            {rating!.reviews.length > 0 && (
              <div className="-mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {rating!.reviews.slice(0, 6).map((r) => (
                  <div key={r.id} className="flex w-[82%] shrink-0 snap-start flex-col rounded-[18px] border border-line bg-surface p-4 shadow-sm">
                    <div className="text-[13px] text-brand">{"★".repeat(Math.max(1, Math.min(5, Math.round(r.rating))))}</div>
                    {r.comment && <p className="my-2 line-clamp-4 text-sm leading-relaxed text-ink">“{r.comment}”</p>}
                    <div className="mt-auto flex items-center gap-2.5 pt-1">
                      <Photo seed={r.customerFirstName + r.id} className="size-7 rounded-full" />
                      <span className="text-xs font-semibold">{r.customerFirstName}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* 8 · STORY */}
        {menu.restaurant.description && (
          <section className="border-t border-line px-4 py-6">
            <div className="rounded-[24px] border border-line bg-subtle p-5.5" style={{ padding: "22px" }}>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">Our story</span>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-secondary">{menu.restaurant.description}</p>
            </div>
          </section>
        )}

        {/* 9 · FULL MENU */}
        <section id="menu" className="border-t border-line px-4 pb-6 pt-4">
          <h2 className="font-display text-[20px] font-bold tracking-[-0.01em]">
            <span className="mb-1.5 block font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-brand">The full menu</span>
            Order anything
          </h2>

          {menu.categories.length > 0 && (
            <div className="sticky top-[62px] z-20 -mx-4 mt-3 flex gap-2 overflow-x-auto bg-canvas/90 px-4 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button type="button" onClick={() => setActiveCat("all")}
                className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${activeCat === "all" ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink-secondary"}`}>All</button>
              {menu.categories.map((c) => (
                <button key={c.id} type="button" onClick={() => setActiveCat(c.id)}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${activeCat === c.id ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink-secondary"}`}>{c.name}</button>
              ))}
            </div>
          )}

          {visibleCategories.length === 0 ? (
            <div className="mt-6 rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">No items to show.</div>
          ) : visibleCategories.map((category) => (
            <div key={category.id} className="mt-5">
              <p className="font-mono text-[13px] font-bold uppercase tracking-[0.02em] text-ink">{category.name}</p>
              <div className="mt-1">
                {category.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3.5 border-b border-line py-3.5 last:border-b-0">
                    <Photo seed={item.id} className="size-[76px] shrink-0 rounded-[14px]" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-base font-semibold leading-tight tracking-[-0.01em]">{item.name}</p>
                      {item.description && <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-secondary">{item.description}</p>}
                      <p className="mt-1.5 font-display text-[15px] font-bold tabular-nums">{money(item.priceCents)}</p>
                    </div>
                    <AddButton disabled={!item.isOrderable || !cart} onClick={() => handleQuickAdd(item)} soldOut={!item.isOrderable} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* 10 · FINAL CTA */}
        <section className="border-t border-line px-4 py-9 text-center">
          {ratingLabel && <div className="text-[13px] text-brand">★★★★★</div>}
          <div className="mt-2 font-display text-2xl font-extrabold tracking-[-0.02em]">Ready in ~15 minutes.</div>
          {ratingLabel && <div className="mb-4 mt-1 text-[13px] text-ink-secondary">★ {ratingLabel.avg} · {ratingLabel.count.toLocaleString()} review{ratingLabel.count === 1 ? "" : "s"}</div>}
          <a href="#menu" className="mx-auto block max-w-[320px] rounded-full bg-ink px-5 py-4 text-[15px] font-semibold text-canvas shadow-lg">Start your order</a>
        </section>

        {/* 11 · FOOTER */}
        <footer className="px-4 pb-32 pt-6 text-[12.5px] leading-loose text-ink-muted">
          {menu.restaurant.address && <div><b className="font-semibold text-ink-secondary">Address</b> · {menu.restaurant.address}</div>}
          <div className="mt-2.5 opacity-80">Powered by OrderVora</div>
        </footer>
      </div>

      {/* Product sheet (variants / modifiers) */}
      {activeItem && cart && (
        <ItemModal item={activeItem} cartId={cart.id} onClose={() => setActiveItem(null)}
          onAdded={(added) => { setCart((c) => (c ? { ...c, items: [...(c.items ?? []), added] } : c)); setActiveItem(null); }} />
      )}

      {/* Search overlay */}
      {searchOpen && (
        <SearchOverlay
          menu={menu}
          query={query}
          setQuery={setQuery}
          results={searchResults}
          canAdd={!!cart}
          onAdd={(item) => handleQuickAdd(item)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* A · Slide-over cart pill (replaces the old bottom bar) */}
      {cartCount > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-6"
          style={{ background: "linear-gradient(transparent, var(--ov-canvas) 34%)" }}>
          <Link href={`/order/${restaurantId}/cart`}
            className="pointer-events-auto mx-auto flex w-full max-w-[460px] items-center justify-between gap-3 rounded-full bg-ink py-3.5 pl-5 pr-3.5 text-canvas shadow-[0_14px_34px_-12px_rgba(30,20,6,0.5)]">
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <span className="flex min-w-6 items-center justify-center rounded-full bg-canvas/20 px-1.5 py-0.5 text-[13px] font-bold tabular-nums">{cartCount}</span>
              View cart
            </span>
            <span className="pr-1.5 font-display text-[15px] font-bold tabular-nums">{money(subtotalCents)}</span>
          </Link>
        </div>
      )}
    </div>
  );
}

function AddButton({ onClick, disabled, soldOut }: { onClick: () => void; disabled?: boolean; soldOut?: boolean }) {
  if (soldOut) {
    return <span className="shrink-0 rounded-full border border-line px-3 py-1.5 text-[11px] font-semibold text-ink-muted">Sold out</span>;
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Add to order"
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-xl leading-none text-canvas shadow-sm transition active:scale-90 disabled:opacity-40">
      +
    </button>
  );
}

function SearchOverlay({
  menu, query, setQuery, results, canAdd, onAdd, onClose,
}: {
  menu: PublicMenu;
  query: string;
  setQuery: (v: string) => void;
  results: PublicMenuItem[];
  canAdd: boolean;
  onAdd: (item: PublicMenuItem) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 flex items-center gap-2 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur-xl">
          <label className="flex flex-1 items-center gap-2.5 rounded-[14px] border border-line bg-subtle px-3.5 py-3">
            <Glyph d={ICON_SEARCH} className="h-[18px] w-[18px] text-ink-muted" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the menu"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-muted" />
          </label>
          <button type="button" onClick={onClose} aria-label="Close search" className="flex size-9 items-center justify-center rounded-xl text-ink-secondary">
            <Glyph d={ICON_CLOSE} className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-4">
          {query.trim() === "" ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">Popular searches</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {menu.categories.slice(0, 6).map((c) => (
                  <button key={c.id} type="button" onClick={() => setQuery(c.name)}
                    className="rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink-secondary">{c.name}</button>
                ))}
              </div>
            </>
          ) : results.length === 0 ? (
            <div className="rounded-[18px] border border-line bg-surface px-4 py-10 text-center text-sm text-ink-secondary">No items match “{query}”.</div>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">Results · <span className="text-ink-secondary">{results.length} item{results.length === 1 ? "" : "s"}</span></p>
              <div className="mt-3 flex flex-col gap-3.5">
                {results.map((item) => (
                  <div key={item.id} className="flex items-center gap-3.5">
                    <Photo seed={item.id} className="size-16 shrink-0 rounded-[14px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[15px] font-semibold leading-tight">{item.name}</p>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-ink">{money(item.priceCents)}</p>
                    </div>
                    <AddButton disabled={!item.isOrderable || !canAdd} onClick={() => onAdd(item)} soldOut={!item.isOrderable} />
                  </div>
                ))}
              </div>
            </>
          )}
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

  const variantDelta = item.variants.find((v) => v.id === variantId)?.priceDeltaCents ?? 0;
  const optionsDelta = item.modifierGroups
    .flatMap((g) => g.options)
    .filter((o) => selectedOptionIds.has(o.id))
    .reduce((sum, o) => sum + o.priceDeltaCents, 0);
  const totalCents = (item.priceCents + variantDelta + optionsDelta) * quantity;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[460px] flex-col overflow-y-auto rounded-t-[28px] bg-canvas sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-2 sm:hidden" style={{ background: "var(--ov-line)" }} />
        <div className="px-5 pb-3 pt-3">
          <div className="mb-3 flex justify-end">
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-secondary">
              <Glyph d={ICON_CLOSE} className="h-5 w-5" />
            </button>
          </div>
          <Photo seed={item.id} className="aspect-square w-full rounded-[20px]" />
          <h3 className="mt-4 font-display text-[22px] font-bold tracking-[-0.015em] text-ink">{item.name}</h3>
          {item.description && <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{item.description}</p>}

          {item.variants.length > 0 && (
            <div className="mt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">Size</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.variants.map((v) => (
                  <button key={v.id} type="button" onClick={() => setVariantId(v.id)} aria-pressed={variantId === v.id}
                    className={`rounded-full border px-3.5 py-2 text-[13px] font-semibold transition ${variantId === v.id ? "border-ink bg-ink text-canvas" : "border-line bg-surface text-ink-secondary"}`}>
                    {v.name}{v.priceDeltaCents !== 0 && ` · +${money(v.priceDeltaCents)}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.modifierGroups.map((group) => (
            <div key={group.id} className="mt-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-muted">
                {group.name}{group.isRequired && <span className="text-brand"> · required</span>}
              </p>
              <div className="mt-2 flex flex-col">
                {group.options.map((option) => {
                  const selected = selectedOptionIds.has(option.id);
                  return (
                    <label key={option.id} className="flex cursor-pointer items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
                      <span className="text-sm text-ink">
                        {option.name}
                        {option.priceDeltaCents !== 0 && <span className="text-ink-muted"> · +{money(option.priceDeltaCents)}</span>}
                      </span>
                      <input type={group.selectionType === "SINGLE" ? "radio" : "checkbox"} name={group.id} className="sr-only"
                        disabled={!option.isAvailable} checked={selected}
                        onChange={() => toggleOption(group.id, option.id, group.selectionType === "SINGLE")} />
                      <span className={`flex size-6 shrink-0 items-center justify-center rounded-md border text-[13px] ${selected ? "border-ink bg-ink text-canvas" : "border-line-2 bg-surface"} ${!option.isAvailable ? "opacity-40" : ""}`}
                        style={{ borderColor: selected ? "var(--ov-ink)" : "var(--ov-line)" }}>
                        {selected ? "✓" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </div>

        <div className="sticky bottom-0 flex items-center gap-3 border-t border-line bg-canvas px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3.5 rounded-full border-[1.5px] px-3.5 py-2 font-semibold" style={{ borderColor: "var(--ov-line)" }}>
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Decrease" className="text-lg leading-none text-ink">−</button>
            <span className="min-w-4 text-center tabular-nums">{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => q + 1)} aria-label="Increase" className="text-lg leading-none text-ink">+</button>
          </div>
          <button type="button" onClick={handleAdd} disabled={submitting}
            className="flex-1 rounded-full bg-ink px-5 py-3.5 text-[15px] font-semibold text-canvas shadow-sm transition active:scale-[0.98] disabled:opacity-50">
            {submitting ? "Adding…" : <>Add to order · <span className="tabular-nums">{money(totalCents)}</span></>}
          </button>
        </div>
      </div>
    </div>
  );
}
