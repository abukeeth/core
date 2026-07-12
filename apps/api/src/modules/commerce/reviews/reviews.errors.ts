export class OrderNotReviewableError extends Error {
  constructor() {
    super("Only your own completed orders can be reviewed");
  }
}

export class OrderAlreadyReviewedError extends Error {
  constructor() {
    super("This order has already been reviewed");
  }
}
