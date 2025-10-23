/**
 * Conversation Manager Service - Entry Point
 *
 * Handles chat history storage, context extraction, and conversation summarization
 * using Gemini Flash.
 */

import { app } from './server';
import { config } from './config/config';

const port = config.port;
const host = '0.0.0.0'; // Listen on all interfaces for Cloud Run

app.listen(port, host, () => {
  console.log(`Conversation Manager Service started`);
  console.log(`Environment: ${config.environment}`);
  console.log(`Host: ${host}`);
  console.log(`Port: ${port}`);
  console.log(`Project ID: ${config.projectId}`);
  console.log(`BigQuery Dataset: ${config.bqDatasetChatHistory}`);
  console.log(`Gemini Model: ${config.geminiModel}`);
  console.log(`Max Conversation History: ${config.maxConversationHistory} messages`);
  console.log(`Server is ready to accept requests on ${host}:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  process.exit(0);
});
