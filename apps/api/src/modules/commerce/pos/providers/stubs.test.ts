import { describe, expect, it } from "vitest";
import { POSProviderNotImplementedError } from "../pos.errors";
import { CloverPOSProviderAdapter } from "./clover-pos.provider";
import { GenericPOSProviderAdapter } from "./generic.provider";
import { LightspeedPOSProviderAdapter } from "./lightspeed.provider";
import { SquarePOSProviderAdapter } from "./square-pos.provider";
import { ToastPOSProviderAdapter } from "./toast.provider";

const stubs = [
  new SquarePOSProviderAdapter(),
  new CloverPOSProviderAdapter(),
  new ToastPOSProviderAdapter(),
  new LightspeedPOSProviderAdapter(),
  new GenericPOSProviderAdapter(),
];

describe.each(stubs)("stub POS adapter %#", (adapter) => {
  it("is marked not implemented", () => {
    expect(adapter.implemented).toBe(false);
  });

  it("every method throws POSProviderNotImplementedError", async () => {
    await expect(adapter.importMenu("creds")).rejects.toBeInstanceOf(POSProviderNotImplementedError);
    await expect(
      adapter.exportOrder({ orderId: "o1", orderNumber: 1, items: [], totalCents: 0 }, "creds"),
    ).rejects.toBeInstanceOf(POSProviderNotImplementedError);
    await expect(adapter.getSyncStatus("creds")).rejects.toBeInstanceOf(POSProviderNotImplementedError);
  });
});
