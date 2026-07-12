import { describe, expect, it } from "vitest";
import { isRestaurantOpenAt } from "./hours.service";

function row(overrides: Record<string, unknown> = {}) {
  return { dayOfWeek: "MONDAY", opensAt: 11 * 60, closesAt: 21 * 60, isClosed: false, ...overrides };
}

describe("isRestaurantOpenAt", () => {
  it("is open during a matching open window", () => {
    const monday1pm = new Date("2026-07-06T13:00:00"); // a Monday
    expect(isRestaurantOpenAt([row()] as never, monday1pm)).toBe(true);
  });

  it("is closed outside the window", () => {
    const monday9am = new Date("2026-07-06T09:00:00");
    expect(isRestaurantOpenAt([row()] as never, monday9am)).toBe(false);
  });

  it("is closed on a day with no matching row", () => {
    const tuesday1pm = new Date("2026-07-07T13:00:00");
    expect(isRestaurantOpenAt([row()] as never, tuesday1pm)).toBe(false);
  });

  it("respects isClosed even within the nominal time window", () => {
    const monday1pm = new Date("2026-07-06T13:00:00");
    expect(isRestaurantOpenAt([row({ isClosed: true })] as never, monday1pm)).toBe(false);
  });

  it("supports split shifts (multiple rows for the same day)", () => {
    const rows = [row({ opensAt: 11 * 60, closesAt: 14 * 60 }), row({ opensAt: 17 * 60, closesAt: 21 * 60 })];
    const lunch = new Date("2026-07-06T12:00:00");
    const gap = new Date("2026-07-06T15:30:00");
    const dinner = new Date("2026-07-06T18:00:00");
    expect(isRestaurantOpenAt(rows as never, lunch)).toBe(true);
    expect(isRestaurantOpenAt(rows as never, gap)).toBe(false);
    expect(isRestaurantOpenAt(rows as never, dinner)).toBe(true);
  });
});
