import { describe, expect, it } from "vitest";
import { FulfillmentProviderNotImplementedError } from "../fulfillment.errors";
import { DoorDashDriveProvider } from "./doordash-drive.provider";
import { LocalCourierProvider } from "./local-courier.provider";
import { UberDirectProvider } from "./uber-direct.provider";

const stubs = [new UberDirectProvider(), new DoorDashDriveProvider(), new LocalCourierProvider()];

describe.each(stubs)("stub fulfillment adapter %#", (adapter) => {
  it("is marked not implemented", () => {
    expect(adapter.implemented).toBe(false);
  });

  it("every method throws FulfillmentProviderNotImplementedError", async () => {
    const input = {
      fulfillmentId: "f1",
      pickupAddress: { line1: "1 Main St", city: "Springfield", state: "IL", postalCode: "62701" },
      dropoffAddress: { line1: "2 Main St", city: "Springfield", state: "IL", postalCode: "62701" },
      readyTime: new Date(),
    };
    await expect(adapter.requestDelivery(input, "creds")).rejects.toBeInstanceOf(
      FulfillmentProviderNotImplementedError,
    );
    await expect(adapter.cancelDelivery("ext-1", "creds")).rejects.toBeInstanceOf(
      FulfillmentProviderNotImplementedError,
    );
    await expect(adapter.getDeliveryStatus("ext-1", "creds")).rejects.toBeInstanceOf(
      FulfillmentProviderNotImplementedError,
    );
    expect(() => adapter.parseWebhookEvent({})).toThrow(FulfillmentProviderNotImplementedError);
  });
});
