/** Typed errors for the Super Admin module — mapped to HTTP codes in admin.controller.ts. */

export class AdminTargetNotFoundError extends Error {
  constructor(kind: string) {
    super(`${kind} not found`);
  }
}

/** The echoed confirmation name didn't match the restaurant's exact name — destructive action refused. */
export class AdminDeleteConfirmationMismatchError extends Error {
  constructor() {
    super("Confirmation name does not match the business name exactly");
  }
}

export class CannotModifySelfError extends Error {
  constructor() {
    super("You can't deactivate your own admin account");
  }
}
