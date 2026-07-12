/**
 * Sprint 08 — Beta Experience.
 *
 * Places one real DELIVERY order for Golden Dragon Bistro, logged in as
 * the seeded demo customer account, so the beta demo has a genuine
 * delivery order to walk through Kitchen -> Driver -> Delivery with.
 *
 * Why this is a script rather than something you click through in the
 * browser: while building this demo, `apps/web/src/app/order/[restaurantId]/cart/page.tsx`
 * turned out to have no delivery-address picker at all — it only ever
 * calls `setCartFulfillment({ fulfillmentType })`, never `deliveryAddressId`
 * (confirmed by reading the component). The backend has always supported
 * a `deliveryAddressId` on that same PATCH (cart.validation.ts), and
 * quote.service.ts correctly requires a geocoded CustomerAddress for
 * DELIVERY — but with no UI to attach one, a delivery order can only be
 * placed by a logged-in customer (guest checkout has no CustomerAddress
 * at all) AND only via a direct API call, never through today's cart
 * page. This is a real, pre-existing frontend gap discovered while
 * seeding this beta, not something introduced by Sprint 08 — documented
 * in docs/reports/Sprint08/BETA_DEMO_GUIDE.md as a known limitation for a
 * future sprint, deliberately not fixed here per "no new features."
 *
 * The PICKUP path has no such gap — the cart page's fulfillment-type
 * toggle is all that's needed, so that's the order you place yourself,
 * live, through the real UI during the demo.
 *
 * Usage: BASE_URL=http://localhost:4000 pnpm --filter api run seed:beta:delivery-order
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD } from "../prisma/demo-credentials";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const CUSTOMER_EMAIL = "customer@demo.ordervora.example";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

class Session {
  private cookies = new Map<string, string>();

  private applySetCookie(res: Response) {
    for (const entry of res.headers.getSetCookie?.() ?? []) {
      const [pair] = entry.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "content-type": "application/json", cookie: this.cookieHeader(), ...extraHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.applySetCookie(res);
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    return json as T;
  }
}

async function main() {
  const restaurant = await prisma.restaurant.findFirst({ where: { name: "Golden Dragon Bistro" } });
  if (!restaurant) throw new Error("Run `pnpm --filter api run seed:beta` first.");

  const menuItem = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id, isAvailable: true },
    include: { inventory: true },
  });
  if (!menuItem || menuItem.inventory?.isTemporarilyOutOfStock) throw new Error("No orderable menu item found.");

  const session = new Session();
  await session.request("POST", "/api/customer/auth/login", { email: CUSTOMER_EMAIL, password: DEMO_PASSWORD });

  const { addresses } = await session.request<{ addresses: { id: string }[] }>("GET", "/api/customer/addresses");
  if (addresses.length === 0) throw new Error("Demo customer has no saved address — run seed:beta first.");
  const deliveryAddressId = addresses[0].id;

  const { cart } = await session.request<{ cart: { id: string } }>(
    "POST",
    `/api/public/restaurants/${restaurant.id}/cart`,
    { fulfillmentType: "DELIVERY" },
  );

  await session.request("POST", `/api/public/cart/${cart.id}/items`, { menuItemId: menuItem.id, quantity: 2 });
  await session.request("PATCH", `/api/public/cart/${cart.id}/fulfillment`, { fulfillmentType: "DELIVERY", deliveryAddressId });

  const { order } = await session.request<{ order: { id: string; orderNumber: number } }>(
    "POST",
    `/api/public/checkout/${cart.id}/place-order`,
    { tipCents: 300, methodType: "CASH_ON_DELIVERY" },
    { "idempotency-key": randomUUID() },
  );

  console.log(`Placed DELIVERY order #${order.orderNumber} (id: ${order.id}) for Golden Dragon Bistro.`);
  console.log(`Next: log in as kitchen@goldendragon.demo, open /dashboard/kitchen, advance it to Ready.`);
  console.log(`Then: pnpm --filter api exec tsx scripts/demo-assign-driver.ts ${order.id}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
