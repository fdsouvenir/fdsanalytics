/**
 * Tool Server - Response Engine
 *
 * Stateless API server that exposes analytics intent functions as tools
 * for Vertex AI Agent Builder to call.
 *
 * Architecture:
 * - POST /execute-tool - Main endpoint for tool execution (IAM protected)
 * - GET /health - Health check for Cloud Run (unauthenticated)
 * - GET / - Status endpoint (unauthenticated)
 */

import express, { Request, Response } from 'express';
import { Config } from './config/config';
import { iamAuthOrBypass } from './middleware/iamAuth';
import { handleExecuteTool } from './handlers/executeTool.handler';
import { handleStatusCommand } from './handlers/status.handler';

/**
 * Create and configure Express server
 */
export function createServer(config: Config): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());

  // Request logging middleware
  app.use((req, res, next) => {
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Incoming request',
      method: req.method,
      path: req.path,
      userAgent: req.headers['user-agent'],
      traceContext: req.headers['x-cloud-trace-context']
    }));
    next();
  });

  // ============================================================================
  // Unauthenticated Endpoints (for health checks and monitoring)
  // ============================================================================

  /**
   * GET /health
   * Health check endpoint for Cloud Run liveness/readiness probes
   */
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'healthy',
      service: 'response-engine-tool-server',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      environment: config.environment
    });
  });

  /**
   * GET /
   * Status endpoint (same as /health for backward compatibility)
   */
  app.get('/', (req: Request, res: Response) => {
    handleStatusCommand(req, res);
  });

  // ============================================================================
  // Authenticated Tool Endpoint (IAM protected)
  // ============================================================================

  /**
   * POST /execute-tool
   *
   * Main endpoint for tool execution. Protected by IAM authentication.
   *
   * Request body:
   * {
   *   "tool_name": "show_daily_sales",
   *   "tenant_id": "senso-sushi",
   *   "args": { "startDate": "2025-05-01", "endDate": "2025-05-31" }
   * }
   *
   * Response:
   * {
   *   "status": "success",
   *   "data": [...],
   *   "chartUrl": "https://...",
   *   "metadata": { "tool_name": "...", "row_count": 10 }
   * }
   */
  app.post('/execute-tool', iamAuthOrBypass, handleExecuteTool);

  // ============================================================================
  // Error Handlers
  // ============================================================================

  /**
   * 404 handler for undefined routes
   */
  app.use((req: Request, res: Response) => {
    console.warn(JSON.stringify({
      severity: 'WARNING',
      message: 'Route not found',
      method: req.method,
      path: req.path
    }));

    res.status(404).json({
      status: 'error',
      error: {
        message: 'Not found',
        code: 'ROUTE_NOT_FOUND',
        path: req.path
      }
    });
  });

  /**
   * Global error handler
   */
  app.use((error: any, req: Request, res: Response, next: any) => {
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Unhandled error',
      error: error.message,
      stack: error.stack,
      path: req.path
    }));

    res.status(500).json({
      status: 'error',
      error: {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    });
  });

  return app;
}
