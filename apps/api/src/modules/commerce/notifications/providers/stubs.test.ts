import { describe, expect, it } from "vitest";
import { PushNotificationProviderAdapter } from "./push.provider";

// SMS is implemented (Twilio) — see sms.provider.test.ts. PUSH remains a stub.
describe.each([new PushNotificationProviderAdapter()])("stub notification adapter %#", (adapter) => {
  it("is marked not implemented", () => {
    expect(adapter.implemented).toBe(false);
  });

  it("returns a soft failure rather than throwing", async () => {
    const result = await adapter.send({ type: "ORDER_CONFIRMATION", to: "x", body: "y" });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toBeTruthy();
  });
});
