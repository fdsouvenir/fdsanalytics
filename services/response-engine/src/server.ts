import express, { Request, Response } from 'express';
import { ResponseEngine } from './core/ResponseEngine';
import { ConversationClient } from './clients/ConversationClient';
import { GeminiClient } from './clients/GeminiClient';
import { Config } from './config/config';
import { handleChatMessage } from './handlers/chatMessage.handler';
import { handleSetupCommand } from './handlers/setup.handler';
import { handleStatusCommand } from './handlers/status.handler';

/**
 * Create and configure Express server
 */
export function createServer(config: Config): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());

  // Initialize clients
  const conversationClient = new ConversationClient(config.conversationManagerUrl);
  const geminiClient = new GeminiClient(
    config.projectId,
    config.geminiSecretName,
    config.geminiModelPro
  );

  // Initialize ResponseEngine
  const responseEngine = new ResponseEngine(
    config,
    conversationClient,
    geminiClient
  );

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'response-engine',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });

  // Google Chat webhook endpoint
  app.post('/webhook', async (req: Request, res: Response) => {
    try {
      const messageText = req.body.message?.text || '';

      // Route commands
      if (messageText.startsWith('/setup')) {
        await handleSetupCommand(req, res);
        return;
      }

      if (messageText.startsWith('/status')) {
        await handleStatusCommand(req, res);
        return;
      }

      // Regular message
      await handleChatMessage(req, res, responseEngine);
    } catch (error: any) {
      console.error('Error in webhook handler', {
        error: error.message,
        stack: error.stack
      });

      res.status(500).json({
        text: 'Sorry, I encountered an error. Please try again.'
      });
    }
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not found',
      path: req.path
    });
  });

  return app;
}
