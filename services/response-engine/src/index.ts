import { createServer } from './server';
import { loadConfig } from './config/config';

/**
 * Response Engine Entry Point
 *
 * Starts HTTP server on configured port
 */
async function main() {
  try {
    // Load configuration
    const config = loadConfig();

    console.log('Starting Response Engine...', {
      environment: config.environment,
      projectId: config.projectId,
      port: config.port,
      conversationManagerUrl: config.conversationManagerUrl
    });

    // Create server
    const app = createServer(config);

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`Response Engine listening on port ${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/health`);
      console.log(`Webhook: http://localhost:${config.port}/webhook`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error: any) {
    console.error('Failed to start Response Engine', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start server
main();
