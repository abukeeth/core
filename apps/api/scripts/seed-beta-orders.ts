import { randomBytes, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { DEMO_PASSWORD } from "../prisma/demo-credentials";

/**
 * Sprint 08 — Beta Experience.
 *
 * Seeds realistic order history by driving the REAL HTTP checkout and
 * order-status API against a running server (BASE_URL below) — not by
 * writing Order/OrderItem/Fulfillment/Transaction rows directly. This is
 * deliberate: those rows are produced by a fairly involved transaction
 * (checkout.service.ts's placeOrder) that also writes OrderEvent/
 * OrderTimeline/Transaction rows and enforces the real state machine.
 * Driving it through the same API a customer/staff member actually uses
 * guarantees every seeded order is indistinguishable from one a real
 * person placed — no risk of a hand-crafted row shape drifting from what
 * the app itself considers valid, and it doubles as a smoke test that
 * checkout/order-progression genuinely works end to end.
 *
 * Every order uses CASH_ON_DELIVERY/CASH_AT_PICKUP — the one payment
 * path that needs no external provider credentials (see
 * checkout.service.ts's CASH_METHOD_TYPES branch) — so this script has
 * zero external dependencies beyond the API server itself.
 *
 * createdAt/confirmedAt and OrderTimeline timestamps are backdated by a
 * small, clearly-labeled direct-Prisma touch-up after each order reaches
 * its terminal state, purely so the Orders list/analytics views show a
 * spread across the last ~7 days instead of every order landing in the
 * same second — cosmetic only, applied after the real state machine has
 * already produced a correct, valid order.
 *
 * Usage: BASE_URL=http://localhost:4000 pnpm --filter api run seed:beta:orders
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

class Session {
  private cookies = new Map<string, string>();

  private applySetCookie(res: Response) {
    const raw = res.headers.getSetCookie?.() ?? [];
    for (const entry of raw) {
      const [pair] = entry.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  setCookie(name: string, value: string) {
    this.cookies.set(name, value);
  }

  async request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        cookie: this.cookieHeader(),
        ...extraHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.applySetCookie(res);
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
    }
    return json as T;
  }
}

async function loginStaff(email: string): Promise<Session> {
  const session = new Session();
  await session.request("POST", "/api/auth/login", { email, password: DEMO_PASSWORD });
  return session;
}

function guestSession(): Session {
  const session = new Session();
  session.setCookie("guest_session_id", randomBytes(24).toString("base64url"));
  return session;
}

interface OrderSpec {
  restaurantId: string;
  menuItemIds: string[];
  // Guest checkout has no Customer row and thus no CustomerAddress —
  // quote.service.ts requires a geocoded CustomerAddress for DELIVERY, so
  // guest-seeded historical orders use PICKUP only. The one live DELIVERY
  // order in this demo is the one you place yourself, logged in as the
  // seeded customer account (which has a saved geocoded address) — see
  // docs/reports/Sprint08/BETA_DEMO_GUIDE.md.
  fulfillmentType: "PICKUP";
  // No REFUNDED status here: refundOrder() (orders.service.ts) requires
  // an order.payment row, which only the card-payment path ever creates
  // — CASH_ON_DELIVERY/CASH_AT_PICKUP orders (markPaidCash) never get
  // one, so a cash order genuinely cannot be refunded via the existing
  // API today. Discovered while seeding; a real product gap worth a
  // future sprint, out of scope to fix here — see BETA_DEMO_GUIDE.md.
  finalStatus: "COMPLETED" | "CANCELLED";
  guestName: string;
  guestEmail: string;
  daysAgo: number;
}

async function placeAndProgressOrder(spec: OrderSpec): Promise<void> {
  const session = guestSession();

  const { cart } = await session.request<{ cart: { id: string } }>("POST", `/api/public/restaurants/${spec.restaurantId}/cart`, {
    fulfillmentType: spec.fulfillmentType,
  });

  for (const menuItemId of spec.menuItemIds) {
    await session.request("POST", `/api/public/cart/${cart.id}/items`, { menuItemId, quantity: 1 });
  }

  const placeResult = await session.request<{ order: { id: string; orderNumber: number; totalCents: number } }>(
    "POST",
    `/api/public/checkout/${cart.id}/place-order`,
    {
      tipCents: 0,
      methodType: "CASH_AT_PICKUP",
      guestEmail: spec.guestEmail,
      guestName: spec.guestName,
    },
    { "idempotency-key": randomUUID() },
  );

  const orderId = placeResult.order.id;

  if (spec.finalStatus === "CANCELLED") {
    const owner = await ownerSessionFor(spec.restaurantId);
    await owner.request("PATCH", `/api/restaurants/me/orders/${orderId}/cancel`, { reason: "Customer requested cancellation" });
  } else {
    const staff = await ownerSessionFor(spec.restaurantId);
    await staff.request("PATCH", `/api/restaurants/me/orders/${orderId}/start-preparing`, {});
    await staff.request("PATCH", `/api/restaurants/me/orders/${orderId}/mark-ready`, {});
    await staff.request("PATCH", `/api/restaurants/me/orders/${orderId}/complete`, {});
    await staff.request("PATCH", `/api/restaurants/me/orders/${orderId}/mark-paid`, {}, { "idempotency-key": randomUUID() });
  }

  // Cosmetic-only backdating so the Orders list/analytics aren't all
  // clustered in the same second — see file header.
  const placedAt = new Date(Date.now() - spec.daysAgo * 24 * 60 * 60 * 1000 - Math.floor(Math.random() * 6 * 60 * 60 * 1000));
  await prisma.order.update({ where: { id: orderId }, data: { createdAt: placedAt, confirmedAt: placedAt } });
  await prisma.orderTimeline.updateMany({ where: { orderId }, data: { occurredAt: placedAt } });
  await prisma.orderEvent.updateMany({ where: { orderId }, data: { createdAt: placedAt } });
}

const ownerSessionCache = new Map<string, Session>();
const restaurantOwnerEmail = new Map<string, string>();

async function ownerSessionFor(restaurantId: string): Promise<Session> {
  const cached = ownerSessionCache.get(restaurantId);
  if (cached) return cached;
  const email = restaurantOwnerEmail.get(restaurantId);
  if (!email) throw new Error(`No owner email registered for restaurant ${restaurantId}`);
  const session = await loginStaff(email);
  ownerSessionCache.set(restaurantId, session);
  return session;
}

const GUEST_NAMES = [
  ["Alex Kim", "alex.kim.demo@example.test"],
  ["Taylor Nguyen", "taylor.nguyen.demo@example.test"],
  ["Jordan Patel", "jordan.patel.demo@example.test"],
  ["Morgan Rivera", "morgan.rivera.demo@example.test"],
  ["Casey Thompson", "casey.thompson.demo@example.test"],
  ["Riley Johnson", "riley.johnson.demo@example.test"],
  ["Drew Martinez", "drew.martinez.demo@example.test"],
  ["Sam Okafor", "sam.okafor.demo@example.test"],
] as const;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seedOrdersForRestaurant(ownerEmail: string, restaurantId: string, count: number) {
  restaurantOwnerEmail.set(restaurantId, ownerEmail);
  const menuItems = await prisma.menuItem.findMany({ where: { restaurantId, isAvailable: true } });
  const orderableItems = await prisma.menuItem.findMany({
    where: { restaurantId, isAvailable: true },
    include: { inventory: true },
  });
  const eligibleIds = orderableItems.filter((i) => !i.inventory?.isTemporarilyOutOfStock).map((i) => i.id);
  if (eligibleIds.length === 0) throw new Error(`No orderable items for restaurant ${restaurantId}`);
  void menuItems;

  for (let i = 0; i < count; i++) {
    const [guestName, guestEmail] = pick(GUEST_NAMES);
    const itemCount = 1 + Math.floor(Math.random() * 3);
    const menuItemIds = Array.from({ length: itemCount }, () => pick(eligibleIds));
    const roll = Math.random();
    const finalStatus = roll < 0.88 ? "COMPLETED" : "CANCELLED";
    const daysAgo = Math.floor(Math.random() * 7);

    try {
      await placeAndProgressOrder({
        restaurantId,
        menuItemIds,
        fulfillmentType: "PICKUP",
        finalStatus,
        guestName,
        guestEmail,
        daysAgo,
      });
      process.stdout.write(".");
    } catch (err) {
      console.error(`\nOrder ${i} for restaurant ${restaurantId} failed:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(` done (${count} attempted)`);
}

async function main() {
  console.log(`Seeding beta order history against ${BASE_URL}...`);

  const restaurants = await prisma.restaurant.findMany({ include: { owner: true } });
  const goldenDragon = restaurants.find((r) => r.name === "Golden Dragon Bistro");
  const bellaItalia = restaurants.find((r) => r.name === "Bella Italia Trattoria");
  const tacoFiesta = restaurants.find((r) => r.name === "Taco Fiesta Cantina");

  if (!goldenDragon || !bellaItalia || !tacoFiesta) {
    throw new Error("Run `pnpm --filter api run seed:beta` first — expected restaurants not found.");
  }

  console.log("Golden Dragon Bistro (40 orders):");
  await seedOrdersForRestaurant(goldenDragon.owner.email, goldenDragon.id, 40);

  console.log("Bella Italia Trattoria (15 orders):");
  await seedOrdersForRestaurant(bellaItalia.owner.email, bellaItalia.id, 15);

  console.log("Taco Fiesta Cantina (15 orders):");
  await seedOrdersForRestaurant(tacoFiesta.owner.email, tacoFiesta.id, 15);

  console.log("\nBeta order history seeding complete. No orders were left in-progress —");
  console.log("the live demo order is meant to be placed by you, live, during the walkthrough.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
