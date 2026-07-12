import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendMail, mockCreateTransport } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockCreateTransport: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mockCreateTransport },
}));

import { EmailNotificationProviderAdapter } from "./email.provider";

const adapter = new EmailNotificationProviderAdapter();

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "user";
  process.env.SMTP_PASSWORD = "pass";
  process.env.SMTP_FROM_ADDRESS = "orders@ordervora.example";
  mockCreateTransport.mockReturnValue({ sendMail: mockSendMail });
});

describe("EmailNotificationProviderAdapter", () => {
  it("is marked implemented", () => {
    expect(adapter.implemented).toBe(true);
  });

  it("sends and reports success with the provider message id", async () => {
    mockSendMail.mockResolvedValue({ messageId: "msg-1" });

    const result = await adapter.send({ type: "ORDER_CONFIRMATION", to: "a@b.com", subject: "Hi", body: "Body" });

    expect(result).toEqual({ success: true, providerMessageId: "msg-1" });
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "orders@ordervora.example", to: "a@b.com" }),
    );
  });

  it("reports a structured failure instead of throwing on send error", async () => {
    mockSendMail.mockRejectedValue(new Error("SMTP connection refused"));

    const result = await adapter.send({ type: "ORDER_CONFIRMATION", to: "a@b.com", body: "Body" });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/SMTP connection refused/);
  });

  it("reports a failure (not a throw) when required SMTP env vars are missing", async () => {
    delete process.env.SMTP_HOST;

    const result = await adapter.send({ type: "ORDER_CONFIRMATION", to: "a@b.com", body: "Body" });

    expect(result.success).toBe(false);
  });
});
