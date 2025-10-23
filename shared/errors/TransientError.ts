/**
 * TransientError - for retryable errors (5xx)
 * Based on Section 2.2 of docs/05-error-handling.md
 */

import { AppError } from './AppError';

export class TransientError extends AppError {
  public readonly retryAfterMs?: number;
  public readonly attempt?: number;
  public readonly maxAttempts?: number;

  constructor(
    message: string,
    code: string,
    context?: Record<string, any>,
    retryAfterMs?: number,
    attempt?: number,
    maxAttempts?: number
  ) {
    super(message, code, context);
    this.name = 'TransientError';
    this.retryAfterMs = retryAfterMs;
    this.attempt = attempt;
    this.maxAttempts = maxAttempts;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfterMs: this.retryAfterMs,
      attempt: this.attempt,
      maxAttempts: this.maxAttempts,
    };
  }
}

export const TransientErrorCodes = {
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  BQ_STREAMING_BUFFER: 'BQ_STREAMING_BUFFER',
  GEMINI_QUOTA_EXCEEDED: 'GEMINI_QUOTA_EXCEEDED',
} as const;
