import { EventEmitter } from "node:events";
import { OrderEventType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../restaurants/restaurant.service", () => ({
  getOwnRestaurantId: vi.fn(),
}));

import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { commerceEventBus } from "../events/event-bus";
import { kitchenStreamHandler } from "./kitchen-stream.controller";

const mockGetOwnRestaurantId = vi.mocked(getOwnRestaurantId);

function makeReqRes(userId = "u1") {
  const req = Object.assign(new EventEmitter(), { user: { id: userId, role: "RESTAURANT_OWNER" } });
  const writes: string[] = [];
  const headers: Record<string, string> = {};
  const res = {
    writableEnded: false,
    statusCode: 0,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      headers[key] = value;
    },
    flushHeaders: vi.fn(),
    write(chunk: string) {
      writes.push(chunk);
      return true;
    },
    end: vi.fn(),
    json: vi.fn(),
  };
  // The handler only uses the Express Request/Response surface stubbed above.
  return { req: req as never, res: res as never, writes, headers };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("kitchenStreamHandler", () => {
  it("404s when the account has no restaurant", async () => {
    mockGetOwnRestaurantId.mockResolvedValue(null);
    const { req, res } = makeReqRes();

    await kitchenStreamHandler(req, res);

    expect((res as unknown as { statusCode: number }).statusCode).toBe(404);
  });

  it("opens an SSE stream and pushes only events scoped to this restaurant", async () => {
    mockGetOwnRestaurantId.mockResolvedValue("rest-1");
    const { req, res, writes, headers } = makeReqRes();

    await kitchenStreamHandler(req, res);

    expect(headers["Content-Type"]).toBe("text/event-stream");
    expect(headers["X-Accel-Buffering"]).toBe("no");
    expect(writes[0]).toContain(": connected");

    commerceEventBus.emit({ type: OrderEventType.ORDER_CREATED, restaurantId: "rest-1", orderId: "o1" });
    commerceEventBus.emit({ type: OrderEventType.ORDER_CREATED, restaurantId: "rest-2", orderId: "o2" });

    const pushed = writes.join("");
    expect(pushed).toContain("event: order");
    expect(pushed).toContain('"orderId":"o1"');
    expect(pushed).not.toContain("o2");

    (req as unknown as EventEmitter).emit("close");
  });

  it("stops pushing (and removes its bus listener) after the client disconnects", async () => {
    mockGetOwnRestaurantId.mockResolvedValue("rest-1");
    const { req, res, writes } = makeReqRes();

    await kitchenStreamHandler(req, res);
    const writesBeforeClose = writes.length;

    (req as unknown as EventEmitter).emit("close");
    commerceEventBus.emit({ type: OrderEventType.ORDER_CONFIRMED, restaurantId: "rest-1", orderId: "o9" });

    expect(writes.length).toBe(writesBeforeClose);
  });
});
