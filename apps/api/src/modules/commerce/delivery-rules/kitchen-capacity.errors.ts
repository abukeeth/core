export class KitchenCapacityNotFoundError extends Error {
  constructor() {
    super("Kitchen capacity settings not found");
  }
}
