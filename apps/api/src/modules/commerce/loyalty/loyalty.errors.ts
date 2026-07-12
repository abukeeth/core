export class LoyaltyProgramInactiveError extends Error {
  constructor() {
    super("This restaurant's loyalty program isn't active");
  }
}

export class InsufficientLoyaltyPointsError extends Error {
  constructor() {
    super("Not enough loyalty points for this redemption");
  }
}
