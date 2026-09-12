export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code: string, statusCode = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(message, "UNAUTHORIZED", 403);
  }
}

export class DuplicateResourceError extends AppError {
  constructor(message: string) {
    super(message, "DUPLICATE_RESOURCE", 409);
  }
}
