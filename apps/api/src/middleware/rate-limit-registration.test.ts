import type { Router } from "express";
import { describe, expect, it } from "vitest";
import { staffActionRateLimiter, webhookRateLimiter } from "./rate-limit";

// The router modules under test transitively import requireAuth ->
// jwt.ts, which reads these at module-load time — set before any
// dynamic import below runs.
process.env.JWT_ACCESS_SECRET ??= "test-secret-for-route-registration";
process.env.JWT_ACCESS_TTL ??= "15m";
process.env.JWT_REFRESH_TTL ??= "30d";

// Verifies every route on a router chains through the given middleware
// function (by reference) somewhere in its stack — a structural
// regression guard for Sprint 07.7 H-13/H-14, so a route added later
// without the limiter fails this test rather than silently shipping
// unprotected.
function everyRouteUses(router: Router, middleware: (...args: never[]) => unknown): void {
  const routeLayers = router.stack.filter((layer) => layer.route);
  expect(routeLayers.length).toBeGreaterThan(0);
  for (const layer of routeLayers) {
    const path = layer.route!.path;
    const usesMiddleware = (layer.route!.stack as Array<{ handle: unknown }>).some((l) => l.handle === middleware);
    expect(usesMiddleware, `expected route "${path}" to use the expected rate limiter`).toBe(true);
  }
}

describe("staffActionRateLimiter registration (Sprint 07.7 H-14)", () => {
  it("is registered on every route in paymentsRouter", async () => {
    const { paymentsRouter } = await import("../modules/commerce/payments/payments.routes.js");
    everyRouteUses(paymentsRouter, staffActionRateLimiter);
  });

  it("is registered on every route in posRouter", async () => {
    const { posRouter } = await import("../modules/commerce/pos/pos.routes.js");
    everyRouteUses(posRouter, staffActionRateLimiter);
  });

  it("is registered on every route in couponsRouter", async () => {
    const { couponsRouter } = await import("../modules/commerce/coupons/coupons.routes.js");
    everyRouteUses(couponsRouter, staffActionRateLimiter);
  });

  it("is registered on every route in the staff-facing ordersRouter", async () => {
    const { ordersRouter } = await import("../modules/commerce/orders/orders.routes.js");
    everyRouteUses(ordersRouter, staffActionRateLimiter);
  });

  it("is registered on every route in deliveryRulesRouter", async () => {
    const { deliveryRulesRouter } = await import("../modules/commerce/delivery-rules/delivery-rules.routes.js");
    everyRouteUses(deliveryRulesRouter, staffActionRateLimiter);
  });

  it("is registered on every route in fulfillmentRouter", async () => {
    const { fulfillmentRouter } = await import("../modules/commerce/fulfillment/fulfillment.routes.js");
    everyRouteUses(fulfillmentRouter, staffActionRateLimiter);
  });

  it("is registered on every route in menuCommerceRouter", async () => {
    const { menuCommerceRouter } = await import("../modules/commerce/menu-commerce/menu-commerce.routes.js");
    everyRouteUses(menuCommerceRouter, staffActionRateLimiter);
  });
});

describe("webhookRateLimiter registration (Sprint 07.7 H-13)", () => {
  it("is registered on every route in paymentWebhookRouter", async () => {
    const { paymentWebhookRouter } = await import("../modules/commerce/payments/payments.routes.js");
    everyRouteUses(paymentWebhookRouter, webhookRateLimiter);
  });
});
