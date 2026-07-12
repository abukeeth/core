export class CouponNotFoundError extends Error {
  constructor() {
    super("Coupon not found");
  }
}

export class CouponCodeInUseError extends Error {
  constructor() {
    super("A coupon with this code already exists");
  }
}

export class CouponInvalidError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
