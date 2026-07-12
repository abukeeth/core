import { describe, expect, it } from "vitest";
import { assertValidOrderTransition, canTransitionOrderStatus, InvalidOrderTransitionError } from "./order-state-machine";

describe("canTransitionOrderStatus", () => {
  it("allows the full happy path for a pickup order", () => {
    expect(canTransitionOrderStatus("PENDING_PAYMENT", "CONFIRMED")).toBe(true);
    expect(canTransitionOrderStatus("CONFIRMED", "PREPARING")).toBe(true);
    expect(canTransitionOrderStatus("PREPARING", "READY")).toBe(true);
    expect(canTransitionOrderStatus("READY", "COMPLETED")).toBe(true);
  });

  it("allows the full happy path for a delivery order", () => {
    expect(canTransitionOrderStatus("PREPARING", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransitionOrderStatus("OUT_FOR_DELIVERY", "COMPLETED")).toBe(true);
  });

  it("allows PENDING_PAYMENT to FAILED", () => {
    expect(canTransitionOrderStatus("PENDING_PAYMENT", "FAILED")).toBe(true);
  });

  it("allows cancellation from any active pre-completion state", () => {
    for (const state of ["PENDING_PAYMENT", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] as const) {
      expect(canTransitionOrderStatus(state, "CANCELLED")).toBe(true);
    }
  });

  it("allows refund from CONFIRMED through COMPLETED", () => {
    for (const state of ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"] as const) {
      expect(canTransitionOrderStatus(state, "REFUNDED")).toBe(true);
    }
  });

  it("rejects refund directly from PENDING_PAYMENT (nothing captured yet)", () => {
    expect(canTransitionOrderStatus("PENDING_PAYMENT", "REFUNDED")).toBe(false);
  });

  it("rejects skipping straight from CONFIRMED to COMPLETED", () => {
    expect(canTransitionOrderStatus("CONFIRMED", "COMPLETED")).toBe(false);
  });

  it("treats CANCELLED, REFUNDED, and FAILED as terminal", () => {
    for (const terminal of ["CANCELLED", "REFUNDED", "FAILED"] as const) {
      for (const target of ["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "COMPLETED"] as const) {
        expect(canTransitionOrderStatus(terminal, target)).toBe(false);
      }
    }
  });
});

describe("assertValidOrderTransition", () => {
  it("does not throw for a legal transition", () => {
    expect(() => assertValidOrderTransition("CONFIRMED", "PREPARING")).not.toThrow();
  });

  it("throws InvalidOrderTransitionError for an illegal transition", () => {
    expect(() => assertValidOrderTransition("CANCELLED", "CONFIRMED")).toThrow(InvalidOrderTransitionError);
  });
});
