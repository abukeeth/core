export class RestaurantAlreadyExistsError extends Error {
  constructor() {
    super("You already have a restaurant");
  }
}

export class NoRestaurantError extends Error {
  constructor() {
    super("No restaurant found for this account");
  }
}

export class RestaurantNotFoundError extends Error {
  constructor() {
    super("Restaurant not found");
  }
}
