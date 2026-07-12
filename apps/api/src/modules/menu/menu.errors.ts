export class CategoryNotFoundError extends Error {
  constructor() {
    super("Menu category not found");
  }
}

export class ItemNotFoundError extends Error {
  constructor() {
    super("Menu item not found");
  }
}
