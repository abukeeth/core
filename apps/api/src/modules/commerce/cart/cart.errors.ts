export class CartNotFoundError extends Error {
  constructor() {
    super("Cart not found");
  }
}

export class CartItemNotFoundError extends Error {
  constructor() {
    super("Cart item not found");
  }
}

export class ItemNotOrderableError extends Error {
  constructor() {
    super("This item is not currently available");
  }
}

export class InvalidModifierSelectionError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

export class CartRestaurantMismatchError extends Error {
  constructor() {
    super("A cart cannot span multiple restaurants");
  }
}

export class DeliveryAddressNotFoundError extends Error {
  constructor() {
    super("Delivery address not found");
  }
}
