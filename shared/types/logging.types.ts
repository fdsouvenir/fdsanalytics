/**
 * Logging types based on Section 11 of API contracts
 */

export interface LogEntry {
  severity: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  message: string;
  timestamp: string;
  component: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  durationMs?: number;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
