/**
 * Retry logic with exponential backoff
 * Based on Section 3 of docs/05-error-handling.md
 */

import { UserInputError } from '../errors/UserInputError';
import { TransientError } from '../errors/TransientError';

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterMs: 500,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(error: any): boolean {
  if (error instanceof UserInputError) {
    return false;
  }

  if (error instanceof TransientError) {
    return true;
  }

  if (error.code?.startsWith('INVALID_')) {
    return false;
  }

  return true;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error | undefined;
  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!shouldRetry(error)) {
        throw error;
      }

      if (attempt === config.maxRetries) {
        break;
      }

      const jitter = Math.random() * config.jitterMs;
      const currentDelay = Math.min(delay + jitter, config.maxDelayMs);

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      await sleep(currentDelay);
      delay *= config.backoffMultiplier;
    }
  }

  throw lastError!;
}
