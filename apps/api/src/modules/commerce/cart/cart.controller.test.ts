import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../customers/customer-jwt", () => ({
  verifyCustomerAccessToken: vi.fn(),
}));

vi.mock("./guest-session", () => ({
  resolveGuestSessionId: vi.fn(),
}));

vi.mock("../coupons/coupons.service", () => ({
  validateCouponForRedemption: vi.fn(),
}));

vi.mock("./cart.service", () => ({
  addCartItem: vi.fn(),
  bindCartToTable: vi.fn(),
  cartSubtotalCents: vi.fn(() => 0),
  getCartWithItems: vi.fn(),
  getOrCreateActiveCart: vi.fn(),
  removeCartItem: vi.fn(),
  setCartCoupon: vi.fn(),
  setCartFulfillment: vi.fn(),
  updateCartItemQuantity: vi.fn(),
}));

import type { Request, Response } from "express";
import { validateCouponForRedemption } from "../coupons/coupons.service";
import { CouponInvalidError } from "../coupons/coupons.errors";
import { verifyCustomerAccessToken } from "../customers/customer-jwt";
import { InvalidQrTokenError } from "../qr-ordering/qr-ordering.errors";
import {
  addCartItemHandler,
  applyCouponHandler,
  bindTableHandler,
  createCartHandler,
  getCartHandler,
  removeCouponHandler,
  setFulfillmentHandler,
  updateCartItemHandler,
} from "./cart.controller";
import { CartNotFoundError, CartRestaurantMismatchError, DeliveryAddressNotFoundError, InvalidModifierSelectionError, ItemNotOrderableError } from "./cart.errors";
import {
  addCartItem,
  bindCartToTable,
  getCartWithItems,
  getOrCreateActiveCart,
  setCartCoupon,
  setCartFulfillment,
  updateCartItemQuantity,
} from "./cart.service";
import { resolveGuestSessionId } from "./guest-session";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), cookie: vi.fn(), send: vi.fn() };
  return res as unknown as Response;
}

/** The default identity every test's cart mocks are set up to match, unless a test explicitly overrides it. */
const OWN_GUEST_SESSION_ID = "guest-own";

function ownCart(overrides: Record<string, unknown> = {}) {
  return { id: "cart-1", restaurantId: "r1", customerId: null, guestSessionId: OWN_GUEST_SESSION_ID, items: [], ...overrides } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveGuestSessionId).mockReturnValue(OWN_GUEST_SESSION_ID);
});

describe("resolveCartIdentity (via createCartHandler)", () => {
  it("uses the customer identity when a valid access token cookie is present", async () => {
    vi.mocked(verifyCustomerAccessToken).mockReturnValue("customer-1");
    vi.mocked(getOrCreateActiveCart).mockResolvedValue({ id: "cart-1" } as never);

    const req = {
      params: { restaurantId: "r1" },
      body: {},
      cookies: { customer_access_token: "valid-token" },
    } as unknown as Request;
    const res = mockRes();

    await createCartHandler(req, res);

    expect(getOrCreateActiveCart).toHaveBeenCalledWith("r1", { customerId: "customer-1" }, "PICKUP");
    expect(resolveGuestSessionId).not.toHaveBeenCalled();
  });

  it("falls back to guest identity when the access token cookie is invalid/expired", async () => {
    vi.mocked(verifyCustomerAccessToken).mockImplementation(() => {
      throw new Error("jwt expired");
    });
    vi.mocked(getOrCreateActiveCart).mockResolvedValue({ id: "cart-1" } as never);

    const req = {
      params: { restaurantId: "r1" },
      body: {},
      cookies: { customer_access_token: "stale-token" },
    } as unknown as Request;
    const res = mockRes();

    await createCartHandler(req, res);

    expect(getOrCreateActiveCart).toHaveBeenCalledWith("r1", { guestSessionId: OWN_GUEST_SESSION_ID }, "PICKUP");
  });

  it("resolves guest identity directly when there is no access token cookie at all", async () => {
    vi.mocked(getOrCreateActiveCart).mockResolvedValue({ id: "cart-1" } as never);

    const req = { params: { restaurantId: "r1" }, body: {}, cookies: {} } as unknown as Request;
    const res = mockRes();

    await createCartHandler(req, res);

    expect(verifyCustomerAccessToken).not.toHaveBeenCalled();
    expect(getOrCreateActiveCart).toHaveBeenCalledWith("r1", { guestSessionId: OWN_GUEST_SESSION_ID }, "PICKUP");
  });
});

describe("getCartHandler", () => {
  it("returns 404 when the cart doesn't exist", async () => {
    vi.mocked(getCartWithItems).mockRejectedValue(new CartNotFoundError());

    const req = { params: { cartId: "nonexistent" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await getCartHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 200 for the owning identity", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());

    const req = { params: { cartId: "cart-1" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await getCartHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 (not the real cart contents) when the caller's identity doesn't own the cart", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ guestSessionId: "someone-elses-guest-session" }));

    const req = { params: { cartId: "cart-1" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await getCartHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 404 when a logged-in customer's identity doesn't match the cart's customerId", async () => {
    vi.mocked(verifyCustomerAccessToken).mockReturnValue("customer-1");
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ customerId: "someone-else", guestSessionId: null }));

    const req = { params: { cartId: "cart-1" }, cookies: { customer_access_token: "valid-token" } } as unknown as Request;
    const res = mockRes();

    await getCartHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("addCartItemHandler error mapping", () => {
  it("maps ItemNotOrderableError to 400", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(addCartItem).mockRejectedValue(new ItemNotOrderableError());

    const req = {
      params: { cartId: "cart-1" },
      body: { menuItemId: "11111111-1111-4111-8111-111111111111" },
      cookies: {},
    } as unknown as Request;
    const res = mockRes();

    await addCartItemHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("maps InvalidModifierSelectionError to 422", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(addCartItem).mockRejectedValue(new InvalidModifierSelectionError("missing required group"));

    const req = {
      params: { cartId: "cart-1" },
      body: { menuItemId: "11111111-1111-4111-8111-111111111111" },
      cookies: {},
    } as unknown as Request;
    const res = mockRes();

    await addCartItemHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("returns 400 on invalid input (not a uuid)", async () => {
    const req = { params: { cartId: "cart-1" }, body: { menuItemId: "not-a-uuid" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await addCartItemHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getCartWithItems).not.toHaveBeenCalled();
  });

  it("returns 404 and never mutates the cart when the caller doesn't own it (IDOR guard)", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ guestSessionId: "someone-elses-guest-session" }));

    const req = {
      params: { cartId: "cart-1" },
      body: { menuItemId: "11111111-1111-4111-8111-111111111111" },
      cookies: {},
    } as unknown as Request;
    const res = mockRes();

    await addCartItemHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(addCartItem).not.toHaveBeenCalled();
  });
});

describe("updateCartItemHandler / removeCartItemHandler / setFulfillmentHandler / removeCouponHandler ownership", () => {
  it("updateCartItemHandler rejects a non-owning identity before mutating", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ guestSessionId: "someone-elses-guest-session" }));

    const req = { params: { cartId: "cart-1", itemId: "item-1" }, body: { quantity: 2 }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await updateCartItemHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(updateCartItemQuantity).not.toHaveBeenCalled();
  });

  it("setFulfillmentHandler rejects a non-owning identity before mutating", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ guestSessionId: "someone-elses-guest-session" }));

    const req = { params: { cartId: "cart-1" }, body: { fulfillmentType: "PICKUP" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await setFulfillmentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(setCartFulfillment).not.toHaveBeenCalled();
  });

  it("removeCouponHandler rejects a non-owning identity before mutating", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ guestSessionId: "someone-elses-guest-session" }));

    const req = { params: { cartId: "cart-1" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await removeCouponHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(setCartCoupon).not.toHaveBeenCalled();
  });

  it("setFulfillmentHandler succeeds for the owning identity", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(setCartFulfillment).mockResolvedValue(ownCart());

    const req = { params: { cartId: "cart-1" }, body: { fulfillmentType: "PICKUP" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await setFulfillmentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(setCartFulfillment).toHaveBeenCalled();
  });

  it("setFulfillmentHandler returns 404 when the service rejects a deliveryAddressId it doesn't own", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(setCartFulfillment).mockRejectedValue(new DeliveryAddressNotFoundError());

    const req = {
      params: { cartId: "cart-1" },
      body: { fulfillmentType: "DELIVERY", deliveryAddressId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" },
      cookies: {},
    } as unknown as Request;
    const res = mockRes();

    await setFulfillmentHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("applyCouponHandler", () => {
  it("maps CouponInvalidError to 422 and does not persist the coupon on the cart", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(validateCouponForRedemption).mockRejectedValue(new CouponInvalidError("expired"));

    const req = { params: { cartId: "cart-1" }, body: { code: "SAVE10" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await applyCouponHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(setCartCoupon).not.toHaveBeenCalled();
  });

  it("normalizes the coupon code to uppercase when persisting", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(validateCouponForRedemption).mockResolvedValue({ coupon: { id: "c1" }, discountCents: 200 } as never);
    vi.mocked(setCartCoupon).mockResolvedValue({ id: "cart-1", couponCode: "SAVE10" } as never);

    const req = { params: { cartId: "cart-1" }, body: { code: "save10" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await applyCouponHandler(req, res);

    expect(setCartCoupon).toHaveBeenCalledWith("cart-1", "SAVE10");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 and never redeems the coupon when the caller doesn't own the cart (IDOR guard)", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ guestSessionId: "someone-elses-guest-session" }));

    const req = { params: { cartId: "cart-1" }, body: { code: "SAVE10" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await applyCouponHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(validateCouponForRedemption).not.toHaveBeenCalled();
    expect(setCartCoupon).not.toHaveBeenCalled();
  });
});

describe("createCartHandler ignores a client-supplied tableId (C-13)", () => {
  it("never forwards a client-supplied tableId to getOrCreateActiveCart", async () => {
    vi.mocked(getOrCreateActiveCart).mockResolvedValue({ id: "cart-1" } as never);

    const req = {
      params: { restaurantId: "r1" },
      body: { fulfillmentType: "DINE_IN", tableId: "attacker-supplied-table-id" },
      cookies: {},
    } as unknown as Request;
    const res = mockRes();

    await createCartHandler(req, res);

    expect(getOrCreateActiveCart).toHaveBeenCalledWith("r1", { guestSessionId: OWN_GUEST_SESSION_ID }, "DINE_IN");
  });
});

describe("bindTableHandler (C-13)", () => {
  it("binds the cart to the server-resolved table for a valid qrToken", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(bindCartToTable).mockResolvedValue({ id: "cart-1", tableId: "table-1", fulfillmentType: "DINE_IN" } as never);

    const req = { params: { cartId: "cart-1" }, body: { qrToken: "qr-abc" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await bindTableHandler(req, res);

    expect(bindCartToTable).toHaveBeenCalledWith("cart-1", "qr-abc");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 404 and never binds when the caller doesn't own the cart (IDOR guard)", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart({ guestSessionId: "someone-elses-guest-session" }));

    const req = { params: { cartId: "cart-1" }, body: { qrToken: "qr-abc" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await bindTableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(bindCartToTable).not.toHaveBeenCalled();
  });

  it("maps InvalidQrTokenError to 404", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(bindCartToTable).mockRejectedValue(new InvalidQrTokenError());

    const req = { params: { cartId: "cart-1" }, body: { qrToken: "bad-token" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await bindTableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("maps CartRestaurantMismatchError (cross-restaurant table) to 400", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(ownCart());
    vi.mocked(bindCartToTable).mockRejectedValue(new CartRestaurantMismatchError());

    const req = { params: { cartId: "cart-1" }, body: { qrToken: "qr-abc" }, cookies: {} } as unknown as Request;
    const res = mockRes();

    await bindTableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 on invalid input (missing qrToken)", async () => {
    const req = { params: { cartId: "cart-1" }, body: {}, cookies: {} } as unknown as Request;
    const res = mockRes();

    await bindTableHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(getCartWithItems).not.toHaveBeenCalled();
  });
});
