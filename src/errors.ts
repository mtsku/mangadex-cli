export class CliError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.details = details;
  }
}

export class AuthError extends CliError {
  constructor(message: string) {
    super("AUTH_ERROR", message);
    this.name = "AuthError";
  }
}

export class ValidationError extends CliError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class ApiError extends CliError {
  readonly status?: number;

  constructor(message: string, status?: number, details?: unknown) {
    super("API_ERROR", message, details);
    this.name = "ApiError";
    this.status = status;
  }
}
