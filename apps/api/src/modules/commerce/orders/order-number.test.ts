import { describe, expect, it, vi } from "vitest";
import { nextOrderNumber } from "./order-number";

function mockTx(lastOrderNumber: number | null) {
  const calls: string[] = [];
  return {
    tx: {
      $executeRaw: vi.fn(async () => {
        calls.push("lock");
        return 0;
      }),
      order: {
        findFirst: vi.fn(async () => {
          calls.push("read");
          return lastOrderNumber === null ? null : { orderNumber: lastOrderNumber };
        }),
      },
    },
    calls,
  };
}

describe("nextOrderNumber (Production Hardening release-blocker fix: order-number generation race)", () => {
  it("returns 1 for a restaurant with no prior orders", async () => {
    const { tx } = mockTx(null);
    await expect(nextOrderNumber(tx as never, "r1")).resolves.toBe(1);
  });

  it("returns the last order number plus one", async () => {
    const { tx } = mockTx(41);
    await expect(nextOrderNumber(tx as never, "r1")).resolves.toBe(42);
  });

  it("acquires a transaction-scoped advisory lock keyed by the restaurantId before reading the last order number", async () => {
    const { tx, calls } = mockTx(5);

    await nextOrderNumber(tx as never, "r1");

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["lock", "read"]);
  });

  it("hashes the restaurantId into the lock call rather than locking a single hardcoded key for every restaurant", async () => {
    const { tx: txA } = mockTx(0);
    const { tx: txB } = mockTx(0);

    await nextOrderNumber(txA as never, "restaurant-a");
    await nextOrderNumber(txB as never, "restaurant-b");

    const callA = txA.$executeRaw.mock.calls[0] as unknown[];
    const callB = txB.$executeRaw.mock.calls[0] as unknown[];
    const [rawStringsA] = callA as [TemplateStringsArray, ...unknown[]];
    const [rawStringsB] = callB as [TemplateStringsArray, ...unknown[]];
    // Same query template either way (parameterized), but the actual bound
    // parameter differs per restaurant -- Prisma's tagged-template
    // $executeRaw passes the interpolated value as a subsequent argument,
    // not baked into the template strings.
    expect(rawStringsA.join("?")).toBe(rawStringsB.join("?"));
    expect(callA).not.toEqual(callB);
  });
});
