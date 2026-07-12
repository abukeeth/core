export class NotImplementedError extends Error {
  constructor(sourceType: string) {
    super(`Import source "${sourceType}" is not implemented yet`);
  }
}

export class ImportJobNotFoundError extends Error {
  constructor() {
    super("Import job not found");
  }
}

export class ImportJobNotReadyError extends Error {
  constructor() {
    super("Import job is not ready for review");
  }
}

export class UnsupportedFileError extends Error {
  constructor() {
    super("Unsupported file type or size");
  }
}

export class ImportJobNotRerunnableError extends Error {
  constructor() {
    super("This import job has no stored file or URL to rerun");
  }
}
