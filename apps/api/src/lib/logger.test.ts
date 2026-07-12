import { describe, expect, it } from "vitest";
import { createLogger, getRequestContext, runWithRequestContext, setRequestRestaurantId } from "./logger";

describe("request context", () => {
  it("returns undefined outside any request context", () => {
    expect(getRequestContext()).toBeUndefined();
  });

  it("makes the context available for the duration of the callback, including through awaits", async () => {
    await runWithRequestContext({ requestId: "req-1" }, async () => {
      expect(getRequestContext()).toEqual({ requestId: "req-1" });
      await Promise.resolve();
      expect(getRequestContext()).toEqual({ requestId: "req-1" });
    });

    expect(getRequestContext()).toBeUndefined();
  });

  it("setRequestRestaurantId attaches restaurantId to the active context without needing a new runWithRequestContext call", () => {
    runWithRequestContext({ requestId: "req-2" }, () => {
      expect(getRequestContext()).toEqual({ requestId: "req-2" });
      setRequestRestaurantId("restaurant-1");
      expect(getRequestContext()).toEqual({ requestId: "req-2", restaurantId: "restaurant-1" });
    });
  });

  it("setRequestRestaurantId is a no-op outside any request context (never throws)", () => {
    expect(() => setRequestRestaurantId("restaurant-1")).not.toThrow();
  });

  it("isolates concurrent contexts from each other", async () => {
    const seen: string[] = [];

    await Promise.all([
      runWithRequestContext({ requestId: "req-a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        seen.push(getRequestContext()!.requestId);
      }),
      runWithRequestContext({ requestId: "req-b" }, async () => {
        seen.push(getRequestContext()!.requestId);
      }),
    ]);

    expect(seen.sort()).toEqual(["req-a", "req-b"]);
  });
});

describe("createLogger", () => {
  it("returns a child logger bound to the given module name", () => {
    const logger = createLogger("test-module");
    expect(logger.bindings()).toEqual({ module: "test-module" });
  });

  it("exposes the standard pino logging methods", () => {
    const logger = createLogger("test-module");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });
});
