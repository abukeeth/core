/**
 * Sprint 08 — Beta Experience.
 *
 * Assigns the demo driver account to a delivery order's Fulfillment via
 * the existing, fully-implemented `POST /me/fulfillment/:id/assign-driver`
 * endpoint (fulfillment.routes.ts) — there is no dashboard button for
 * this yet (Sprint 07 never wired one up; confirmed by grep — no
 * frontend code calls this endpoint), so this is the documented way to
 * exercise the real driver-assignment step of the beta demo without
 * adding a new UI feature. See docs/reports/Sprint08/BETA_DEMO_GUIDE.md.
 *
 * Usage:
 *   BASE_URL=http://localhost:4000 pnpm --filter api exec tsx scripts/demo-assign-driver.ts <orderId>
 *
 * Logs in as the Golden Dragon Bistro owner (demo credentials), looks up
 * the order's fulfillment id, assigns the demo driver account
 * (driver@goldendragon.demo), and prints the result.
 */
import { DEMO_PASSWORD } from "../prisma/demo-credentials";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4000";
const OWNER_EMAIL = "owner@goldendragon.demo";
const DRIVER_EMAIL = "driver@goldendragon.demo";

async function main() {
  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Usage: tsx scripts/demo-assign-driver.ts <orderId>");
    process.exitCode = 1;
    return;
  }

  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: OWNER_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!loginRes.ok) throw new Error(`Owner login failed: ${loginRes.status} ${await loginRes.text()}`);
  const cookie = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const orderRes = await fetch(`${BASE_URL}/api/restaurants/me/orders/${orderId}`, {
    headers: { cookie },
  });
  if (!orderRes.ok) throw new Error(`Fetching order failed: ${orderRes.status} ${await orderRes.text()}`);
  const { order } = (await orderRes.json()) as { order: { fulfillment?: { id: string } } };
  if (!order.fulfillment) throw new Error("This order has no fulfillment record.");

  // Resolve the driver's userId — there is no "list staff" endpoint
  // (confirmed by grep), so this looks it up the one existing way that
  // doesn't require a new endpoint: logging in as the driver themself.
  const driverLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: DRIVER_EMAIL, password: DEMO_PASSWORD }),
  });
  if (!driverLoginRes.ok) throw new Error(`Driver login failed: ${driverLoginRes.status} ${await driverLoginRes.text()}`);
  const driverCookie = (driverLoginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const driverMeRes = await fetch(`${BASE_URL}/api/auth/me`, { headers: { cookie: driverCookie } });
  const { user: driver } = (await driverMeRes.json()) as { user: { id: string } };

  const assignRes = await fetch(`${BASE_URL}/api/restaurants/me/fulfillment/${order.fulfillment.id}/assign-driver`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ driverId: driver.id }),
  });
  if (!assignRes.ok) throw new Error(`Assign driver failed: ${assignRes.status} ${await assignRes.text()}`);

  console.log(`Assigned ${DRIVER_EMAIL} to order ${orderId} (fulfillment ${order.fulfillment.id}).`);
  console.log(`Now log in as ${DRIVER_EMAIL} and open /dashboard/driver to accept and progress the delivery.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
