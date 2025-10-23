/**
 * Unit tests for Logger
 */

import { Logger, createLogger } from '../utils/logger';
import { LogEntry } from '../types/logging.types';

describe('Logger', () => {
  let consoleLogSpy: jest.SpyInstance;
  let logger: Logger;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    logger = new Logger('test-component');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should log debug messages with correct structure', () => {
    logger.debug('Debug message', { foo: 'bar' });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;

    expect(logEntry.severity).toBe('DEBUG');
    expect(logEntry.message).toBe('Debug message');
    expect(logEntry.component).toBe('test-component');
    expect(logEntry.metadata).toEqual({ foo: 'bar' });
    expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should log info messages', () => {
    logger.info('Info message');

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.severity).toBe('INFO');
    expect(logEntry.message).toBe('Info message');
  });

  it('should log warning messages', () => {
    logger.warn('Warning message');

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.severity).toBe('WARNING');
    expect(logEntry.message).toBe('Warning message');
  });

  it('should log error messages with error details', () => {
    const error = new Error('Test error');
    logger.error('Error occurred', error, { userId: 'user123' });

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.severity).toBe('ERROR');
    expect(logEntry.message).toBe('Error occurred');
    expect(logEntry.error).toBeDefined();
    expect(logEntry.error?.name).toBe('Error');
    expect(logEntry.error?.message).toBe('Test error');
    expect(logEntry.error?.stack).toBeDefined();
    expect(logEntry.metadata?.userId).toBe('user123');
  });

  it('should log critical messages', () => {
    const error = new Error('Critical error');
    logger.critical('Critical failure', error);

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.severity).toBe('CRITICAL');
    expect(logEntry.message).toBe('Critical failure');
  });

  it('should include tenantId when provided in metadata', () => {
    logger.info('Message', { tenantId: 'tenant-123' });

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.tenantId).toBe('tenant-123');
  });

  it('should include userId when provided in metadata', () => {
    logger.info('Message', { userId: 'user-456' });

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.userId).toBe('user-456');
  });

  it('should include requestId when provided in metadata', () => {
    logger.info('Message', { requestId: 'req-789' });

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.requestId).toBe('req-789');
  });

  it('should include durationMs when provided in metadata', () => {
    logger.info('Message', { durationMs: 150 });

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.durationMs).toBe(150);
  });

  it('should create logger with createLogger function', () => {
    const newLogger = createLogger('new-component');
    newLogger.info('Test message');

    const logEntry = JSON.parse(consoleLogSpy.mock.calls[0][0]) as LogEntry;
    expect(logEntry.component).toBe('new-component');
  });

  it('should output valid JSON for all log levels', () => {
    logger.debug('Debug');
    logger.info('Info');
    logger.warn('Warn');
    logger.error('Error', new Error('Test'));
    logger.critical('Critical', new Error('Test'));

    expect(consoleLogSpy).toHaveBeenCalledTimes(5);
    consoleLogSpy.mock.calls.forEach((call) => {
      expect(() => JSON.parse(call[0])).not.toThrow();
    });
  });
});
