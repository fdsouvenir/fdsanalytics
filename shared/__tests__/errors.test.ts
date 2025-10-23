/**
 * Unit tests for error classes
 */

import { AppError } from '../errors/AppError';
import { UserInputError, UserInputErrorCodes } from '../errors/UserInputError';
import { TransientError, TransientErrorCodes } from '../errors/TransientError';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with message and code', () => {
      const error = new AppError('Test error', 'TEST_ERROR');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('AppError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include context when provided', () => {
      const context = { userId: 'user123', resource: 'test' };
      const error = new AppError('Test error', 'TEST_ERROR', context);

      expect(error.context).toEqual(context);
    });

    it('should have stack trace', () => {
      const error = new AppError('Test error', 'TEST_ERROR');
      expect(error.stack).toBeDefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new AppError('Test error', 'TEST_ERROR', { foo: 'bar' });
      const json = error.toJSON();

      expect(json).toEqual({
        error: true,
        code: 'TEST_ERROR',
        message: 'Test error',
        details: { foo: 'bar' },
        timestamp: error.timestamp,
      });
    });
  });

  describe('UserInputError', () => {
    it('should create user input error', () => {
      const error = new UserInputError('Invalid category', 'INVALID_CATEGORY');

      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('UserInputError');
      expect(error.message).toBe('Invalid category');
      expect(error.code).toBe('INVALID_CATEGORY');
    });

    it('should include suggestions when provided', () => {
      const suggestions = ['Option A', 'Option B'];
      const error = new UserInputError(
        'Invalid input',
        'INVALID_CATEGORY',
        undefined,
        suggestions
      );

      expect(error.suggestions).toEqual(suggestions);
    });

    it('should serialize with suggestions', () => {
      const error = new UserInputError(
        'Invalid category',
        'INVALID_CATEGORY',
        { provided: 'invalid' },
        ['Option A', 'Option B']
      );
      const json = error.toJSON();

      expect(json.suggestions).toEqual(['Option A', 'Option B']);
      expect(json.code).toBe('INVALID_CATEGORY');
    });

    it('should have all error codes defined', () => {
      expect(UserInputErrorCodes.INVALID_CATEGORY).toBe('INVALID_CATEGORY');
      expect(UserInputErrorCodes.INVALID_TIMEFRAME).toBe('INVALID_TIMEFRAME');
      expect(UserInputErrorCodes.INVALID_DATE_RANGE).toBe('INVALID_DATE_RANGE');
      expect(UserInputErrorCodes.AMBIGUOUS_QUERY).toBe('AMBIGUOUS_QUERY');
      expect(UserInputErrorCodes.MISSING_REQUIRED_PARAM).toBe('MISSING_REQUIRED_PARAM');
      expect(UserInputErrorCodes.PARAM_OUT_OF_RANGE).toBe('PARAM_OUT_OF_RANGE');
    });
  });

  describe('TransientError', () => {
    it('should create transient error', () => {
      const error = new TransientError('Service unavailable', 'SERVICE_UNAVAILABLE');

      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('TransientError');
      expect(error.message).toBe('Service unavailable');
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should include retry information when provided', () => {
      const error = new TransientError(
        'Service unavailable',
        'SERVICE_UNAVAILABLE',
        undefined,
        5000,
        2,
        3
      );

      expect(error.retryAfterMs).toBe(5000);
      expect(error.attempt).toBe(2);
      expect(error.maxAttempts).toBe(3);
    });

    it('should serialize with retry information', () => {
      const error = new TransientError(
        'Service unavailable',
        'SERVICE_UNAVAILABLE',
        { service: 'bigquery' },
        5000,
        2,
        3
      );
      const json = error.toJSON();

      expect(json.retryAfterMs).toBe(5000);
      expect(json.attempt).toBe(2);
      expect(json.maxAttempts).toBe(3);
      expect(json.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('should have all error codes defined', () => {
      expect(TransientErrorCodes.NETWORK_TIMEOUT).toBe('NETWORK_TIMEOUT');
      expect(TransientErrorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
      expect(TransientErrorCodes.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(TransientErrorCodes.BQ_STREAMING_BUFFER).toBe('BQ_STREAMING_BUFFER');
      expect(TransientErrorCodes.GEMINI_QUOTA_EXCEEDED).toBe('GEMINI_QUOTA_EXCEEDED');
    });
  });
});
