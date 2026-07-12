export class CustomerEmailInUseError extends Error {
  constructor() {
    super("Email already in use");
  }
}

export class InvalidCustomerCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
  }
}

export class InvalidCustomerRefreshTokenError extends Error {
  constructor() {
    super("Invalid or expired refresh token");
  }
}

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("Invalid or expired password reset link");
  }
}

export class CustomerAddressNotFoundError extends Error {
  constructor() {
    super("Address not found");
  }
}

export class CustomerFavoriteNotFoundError extends Error {
  constructor() {
    super("Favorite not found");
  }
}

export class CustomerPaymentMethodNotFoundError extends Error {
  constructor() {
    super("Saved payment method not found");
  }
}
