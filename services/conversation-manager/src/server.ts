/**
 * HTTP Server for Conversation Manager Service
 */

import express, { Request, Response } from 'express';
import { ConversationManager, GetContextRequest, StoreMessageRequest } from './core/ConversationManager';
import { config } from './config/config';

const app = express();
app.use(express.json());

// Initialize ConversationManager
const conversationManager = new ConversationManager();
let initializationPromise: Promise<void> | null = null;

/**
 * Ensure ConversationManager is initialized
 */
async function ensureInitialized(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = conversationManager.initialize();
  }
  await initializationPromise;
}

/**
 * Health check endpoint
 */
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await conversationManager.healthCheck();

    if (health.healthy) {
      res.status(200).json({
        status: 'healthy',
        service: 'conversation-manager',
        timestamp: new Date().toISOString(),
        dependencies: {
          bigquery: health.bigquery ? 'healthy' : 'unhealthy',
          gemini: health.gemini ? 'healthy' : 'unhealthy',
        },
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        service: 'conversation-manager',
        timestamp: new Date().toISOString(),
        dependencies: {
          bigquery: health.bigquery ? 'healthy' : 'unhealthy',
          gemini: health.gemini ? 'healthy' : 'unhealthy',
        },
      });
    }
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      service: 'conversation-manager',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Get conversation context endpoint
 * POST /get-context
 */
app.post('/get-context', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    await ensureInitialized();

    const request: GetContextRequest = {
      userId: req.body.userId,
      threadId: req.body.threadId,
      currentMessage: req.body.currentMessage,
      maxMessages: req.body.maxMessages,
    };

    // Validate required fields
    if (!request.userId || !request.threadId || !request.currentMessage) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_REQUEST',
        message: 'Missing required fields: userId, threadId, currentMessage',
      });
    }

    const context = await conversationManager.getContext(request);
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      context,
      metadata: {
        messageCount: context.relevantMessages.length,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in /get-context:', error);

    return res.status(500).json({
      error: true,
      code: 'INTERNAL_ERROR',
      message: 'Failed to retrieve conversation context',
      details: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * Store message endpoint
 * POST /store-message
 */
app.post('/store-message', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    await ensureInitialized();

    const request: StoreMessageRequest = {
      userId: req.body.userId,
      threadId: req.body.threadId,
      role: req.body.role,
      content: req.body.content,
      workspaceId: req.body.workspaceId,
      messageId: req.body.messageId,
      contextSummary: req.body.contextSummary,
      toolCalls: req.body.toolCalls,
    };

    // Validate required fields
    if (!request.userId || !request.threadId || !request.role || !request.content) {
      return res.status(400).json({
        error: true,
        code: 'INVALID_REQUEST',
        message: 'Missing required fields: userId, threadId, role, content',
      });
    }

    // Validate role
    if (request.role !== 'user' && request.role !== 'assistant') {
      return res.status(400).json({
        error: true,
        code: 'INVALID_ROLE',
        message: 'Role must be either "user" or "assistant"',
      });
    }

    await conversationManager.storeMessage(request);
    const duration = Date.now() - startTime;

    return res.status(200).json({
      success: true,
      message: 'Message stored successfully',
      metadata: {
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in /store-message:', error);

    return res.status(500).json({
      error: true,
      code: 'INTERNAL_ERROR',
      message: 'Failed to store message',
      details: error instanceof Error ? error.message : 'Unknown error',
      metadata: {
        durationMs: duration,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: true,
    code: 'NOT_FOUND',
    message: `Endpoint not found: ${req.method} ${req.path}`,
    availableEndpoints: [
      'GET /health',
      'POST /get-context',
      'POST /store-message',
    ],
  });
});

/**
 * Error handler
 */
app.use((err: Error, _req: Request, res: Response, _next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: true,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    details: config.environment === 'development' ? err.message : undefined,
  });
});

export { app, conversationManager };
