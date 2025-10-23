/**
 * Base AppError class
 * Based on docs/05-error-handling.md
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: true,
      code: this.code,
      message: this.message,
      details: this.context,
      timestamp: this.timestamp,
    };
  }
}
