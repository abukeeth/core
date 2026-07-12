import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    customerFavorite: { findUnique: vi.fn(), delete: vi.fn() },
    customerPaymentMethod: { findUnique: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { CustomerFavoriteNotFoundError, CustomerPaymentMethodNotFoundError } from "./customers.errors";
import { deleteFavorite } from "./favorites.service";
import { deletePaymentMethod } from "./payment-methods.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteFavorite ownership check", () => {
  it("rejects deleting another customer's favorite", async () => {
    mockPrisma.customerFavorite.findUnique.mockResolvedValue({ id: "f1", customerId: "other" } as never);
    await expect(deleteFavorite("my-customer", "f1")).rejects.toBeInstanceOf(CustomerFavoriteNotFoundError);
  });
});

describe("deletePaymentMethod ownership check", () => {
  it("rejects deleting another customer's saved payment method", async () => {
    mockPrisma.customerPaymentMethod.findUnique.mockResolvedValue({ id: "pm1", customerId: "other" } as never);
    await expect(deletePaymentMethod("my-customer", "pm1")).rejects.toBeInstanceOf(
      CustomerPaymentMethodNotFoundError,
    );
  });
});
