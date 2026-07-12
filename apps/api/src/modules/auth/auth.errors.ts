export class EmailInUseError extends Error {
  constructor() {
    super("Email already in use");
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super("Invalid or expired refresh token");
  }
}

export class AccountDeactivatedError extends Error {
  constructor() {
    super("This account has been deactivated. Contact your restaurant owner.");
  }
}

export class StaffNotFoundError extends Error {
  constructor() {
    super("Staff member not found");
  }
}

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("Invalid or expired reset link");
  }
}

export class InvalidEmailVerificationTokenError extends Error {
  constructor() {
    super("Invalid or expired verification link");
  }
}
