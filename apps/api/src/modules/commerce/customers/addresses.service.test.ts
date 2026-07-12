import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    customerAddress: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { CustomerAddressNotFoundError } from "./customers.errors";
import { deleteAddress, updateAddress } from "./addresses.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ownership checks", () => {
  it("rejects updating another customer's address", async () => {
    mockPrisma.customerAddress.findUnique.mockResolvedValue({ id: "a1", customerId: "other" } as never);
    await expect(updateAddress("my-customer", "a1", { city: "Nowhere" })).rejects.toBeInstanceOf(
      CustomerAddressNotFoundError,
    );
  });

  it("rejects deleting another customer's address", async () => {
    mockPrisma.customerAddress.findUnique.mockResolvedValue({ id: "a1", customerId: "other" } as never);
    await expect(deleteAddress("my-customer", "a1")).rejects.toBeInstanceOf(CustomerAddressNotFoundError);
  });
});
