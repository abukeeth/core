import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmsNotificationProviderAdapter } from "./sms.provider";

const ORIGINAL_ENV = { ...process.env };

function configureTwilio() {
  process.env.TWILIO_ACCOUNT_SID = "AC123";
  process.env.TWILIO_AUTH_TOKEN = "tok-secret";
  process.env.TWILIO_FROM_NUMBER = "+15550000000";
}

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("SmsNotificationProviderAdapter (Twilio)", () => {
  const adapter = new SmsNotificationProviderAdapter();

  it("is marked implemented", () => {
    expect(adapter.implemented).toBe(true);
  });

  it("soft-fails without calling Twilio when unconfigured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await adapter.send({ type: "KITCHEN_UNACCEPTED_ALERT", to: "+15551112222", body: "hi" });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/not configured/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs the message to the Twilio API and returns the message sid on success", async () => {
    configureTwilio();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ sid: "SM999" }), { status: 201 }));

    const result = await adapter.send({ type: "KITCHEN_UNACCEPTED_ALERT", to: "+15551112222", body: "Order #7 unaccepted" });

    expect(result).toEqual({ success: true, providerMessageId: "SM999" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toContain("/Accounts/AC123/Messages.json");
    expect((init as RequestInit).method).toBe("POST");
    const body = (init as RequestInit).body as URLSearchParams;
    expect(body.get("To")).toBe("+15551112222");
    expect(body.get("From")).toBe("+15550000000");
    expect(body.get("Body")).toContain("Order #7");
  });

  it("returns Twilio's error message on a non-2xx response (never throws)", async () => {
    configureTwilio();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "The 'To' number is not valid" }), { status: 400 }),
    );

    const result = await adapter.send({ type: "KITCHEN_UNACCEPTED_ALERT", to: "bad", body: "x" });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/not valid/i);
  });

  it("returns a soft failure (never throws) when the network call itself fails", async () => {
    configureTwilio();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const result = await adapter.send({ type: "KITCHEN_UNACCEPTED_ALERT", to: "+15551112222", body: "x" });

    expect(result).toEqual({ success: false, errorMessage: "network down" });
  });
});
