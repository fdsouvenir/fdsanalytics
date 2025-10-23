/**
 * Unit tests for retry logic
 */

import { retryWithBackoff, DEFAULT_RETRY_CONFIG, RetryConfig } from '../utils/retry';
import { UserInputError } from '../errors/UserInputError';
import { TransientError } from '../errors/TransientError';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return result on first successful attempt', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on transient errors', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new TransientError('Temporary failure', 'SERVICE_UNAVAILABLE'))
      .mockRejectedValueOnce(new TransientError('Temporary failure', 'SERVICE_UNAVAILABLE'))
      .mockResolvedValue('success');

    const config: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 3,
      initialDelayMs: 10,
      jitterMs: 0,
    };

    const result = await retryWithBackoff(fn, config);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should not retry on user input errors', async () => {
    const fn = jest.fn().mockRejectedValue(new UserInputError('Invalid input', 'INVALID_CATEGORY'));

    await expect(retryWithBackoff(fn)).rejects.toThrow(UserInputError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw error after max retries exhausted', async () => {
    const error = new TransientError('Persistent failure', 'SERVICE_UNAVAILABLE');
    const fn = jest.fn().mockRejectedValue(error);

    const config: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 3,
      initialDelayMs: 10,
      jitterMs: 0,
    };

    await expect(retryWithBackoff(fn, config)).rejects.toThrow('Persistent failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should apply exponential backoff', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 100,
      maxDelayMs: 1000,
      backoffMultiplier: 2,
      jitterMs: 0,
    };

    const start = Date.now();
    await retryWithBackoff(fn, config);
    const duration = Date.now() - start;

    expect(duration).toBeGreaterThanOrEqual(100 + 200);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect max delay', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const config: RetryConfig = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 500,
      backoffMultiplier: 2,
      jitterMs: 0,
    };

    const start = Date.now();
    await retryWithBackoff(fn, config);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1500);
  });

  it('should call onRetry callback with attempt number and error', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail 1'))
      .mockRejectedValueOnce(new Error('Fail 2'))
      .mockResolvedValue('success');

    const onRetry = jest.fn();

    const config: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      maxRetries: 3,
      initialDelayMs: 10,
      jitterMs: 0,
    };

    await retryWithBackoff(fn, config, onRetry);

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, 1, expect.any(Error));
    expect(onRetry).toHaveBeenNthCalledWith(2, 2, expect.any(Error));
  });

  it('should not retry errors with INVALID_ code prefix', async () => {
    const error = new Error('Invalid input');
    (error as any).code = 'INVALID_PARAMETER';
    const fn = jest.fn().mockRejectedValue(error);

    await expect(retryWithBackoff(fn)).rejects.toThrow('Invalid input');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should use default config when not provided', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue('success');

    const result = await retryWithBackoff(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
