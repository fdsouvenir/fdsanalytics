// Entry point for MCP Server

import { MCPServer } from './server';

const server = new MCPServer();
server.start();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'SIGTERM received, shutting down gracefully',
    component: 'mcp-server',
    timestamp: new Date().toISOString()
  }));
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(JSON.stringify({
    severity: 'INFO',
    message: 'SIGINT received, shutting down gracefully',
    component: 'mcp-server',
    timestamp: new Date().toISOString()
  }));
  process.exit(0);
});
