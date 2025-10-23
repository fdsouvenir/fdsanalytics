/**
 * Structured JSON Logger
 * Based on Section 11: Logging Standards from docs/02-api-contracts.md
 */

import { LogEntry, LogLevel } from '../types/logging.types';

export class Logger {
  constructor(private component: string) {}

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('DEBUG', message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('INFO', message, metadata);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('WARNING', message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('ERROR', message, metadata, error);
  }

  critical(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('CRITICAL', message, metadata, error);
  }

  private log(
    severity: LogLevel,
    message: string,
    metadata?: Record<string, any>,
    error?: Error
  ): void {
    const entry: LogEntry = {
      severity,
      message,
      timestamp: new Date().toISOString(),
      component: this.component,
      ...(metadata?.tenantId && { tenantId: metadata.tenantId }),
      ...(metadata?.userId && { userId: metadata.userId }),
      ...(metadata?.requestId && { requestId: metadata.requestId }),
      ...(metadata?.durationMs && { durationMs: metadata.durationMs }),
      ...(metadata && { metadata }),
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      }),
    };

    console.log(JSON.stringify(entry));
  }
}

export function createLogger(component: string): Logger {
  return new Logger(component);
}
