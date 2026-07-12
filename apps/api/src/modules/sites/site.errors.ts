export class SiteNotFoundError extends Error {
  constructor() {
    super("Website not found");
  }
}

export class SiteAlreadyExistsError extends Error {
  constructor() {
    super("A website already exists for this restaurant");
  }
}

export class VariationNotFoundError extends Error {
  constructor() {
    super("Variation not found");
  }
}

export class SiteVersionNotFoundError extends Error {
  constructor() {
    super("Site version not found");
  }
}

export class PrePublishCheckFailedError extends Error {
  constructor(public readonly issues: string[]) {
    super("Site failed pre-publish checks");
  }
}

export class NoPublishedVersionError extends Error {
  constructor() {
    super("This site has no published version");
  }
}

export class ReleaseNotFoundError extends Error {
  constructor() {
    super("Release not found");
  }
}

export class DomainAlreadyClaimedError extends Error {
  constructor() {
    super("This domain is already claimed by another site");
  }
}

export class DomainNotFoundError extends Error {
  constructor() {
    super("Domain not found");
  }
}

export class InvalidDomainError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class SlugNotEditableError extends Error {
  constructor() {
    super("The temporary domain can only be changed before the site is published — unpublish first, or use a custom domain instead.");
  }
}

export class AssetNotFoundError extends Error {
  constructor() {
    super("Asset not found");
  }
}

export class SuggestionNotFoundError extends Error {
  constructor() {
    super("Suggestion not found");
  }
}
