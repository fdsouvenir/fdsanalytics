// MCP Protocol Server
// Implements tools/list and tools/call endpoints

import express, { Request, Response } from 'express';
import { BigQueryClient } from './bigquery/BigQueryClient';
import { Validator } from './bigquery/Validator';
import { QueryAnalyticsTool } from './tools/queryAnalytics.tool';
import { GetForecastTool } from './tools/getForecast.tool';
import { GetAnomaliesTool } from './tools/getAnomalies.tool';
import { MCP_TOOLS } from './schemas/toolSchemas';
import { config } from './config/config';

export interface MCPRequest {
  method: 'tools/list' | 'tools/call';
  params?: {
    name?: string;
    arguments?: Record<string, any>;
  };
}

export interface MCPResponse {
  result?: any;
  error?: {
    code: number;
    message: string;
    details?: any;
  };
}

export class MCPServer {
  private app: express.Application;
  private bqClient: BigQueryClient;
  private validator: Validator;
  private queryAnalyticsTool: QueryAnalyticsTool;
  private getForecastTool: GetForecastTool;
  private getAnomaliesTool: GetAnomaliesTool;

  constructor() {
    this.app = express();
    this.app.use(express.json());

    // Initialize BigQuery clients
    this.bqClient = new BigQueryClient();
    this.validator = new Validator(this.bqClient);

    // Initialize tools
    this.queryAnalyticsTool = new QueryAnalyticsTool(this.bqClient, this.validator);
    this.getForecastTool = new GetForecastTool(this.bqClient);
    this.getAnomaliesTool = new GetAnomaliesTool(this.bqClient);

    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'mcp-server',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // MCP protocol endpoint
    this.app.post('/mcp', async (req: Request, res: Response) => {
      try {
        const mcpRequest: MCPRequest = req.body;
        const response = await this.handleMCPRequest(mcpRequest);
        res.json(response);
      } catch (error: any) {
        console.error('MCP request error:', error);
        res.status(500).json({
          error: {
            code: -32603,
            message: 'Internal server error',
            details: config.environment === 'development' ? error.message : undefined
          }
        });
      }
    });

    // Direct tool endpoints (for testing)
    this.app.post('/tools/query_analytics', async (req: Request, res: Response) => {
      try {
        const result = await this.queryAnalyticsTool.execute(req.body);
        res.json({ success: true, data: result });
      } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/tools/get_forecast', async (req: Request, res: Response) => {
      try {
        const result = await this.getForecastTool.execute(req.body);
        res.json({ success: true, data: result });
      } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
      }
    });

    this.app.post('/tools/get_anomalies', async (req: Request, res: Response) => {
      try {
        const result = await this.getAnomaliesTool.execute(req.body);
        res.json({ success: true, data: result });
      } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
      }
    });
  }

  private async handleMCPRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params } = request;

    try {
      switch (method) {
        case 'tools/list':
          return {
            result: {
              tools: MCP_TOOLS
            }
          };

        case 'tools/call':
          if (!params?.name) {
            return {
              error: {
                code: -32602,
                message: 'Missing tool name'
              }
            };
          }

          return await this.callTool(params.name, params.arguments || {});

        default:
          return {
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            }
          };
      }
    } catch (error: any) {
      console.error('MCP handler error:', error);
      return {
        error: {
          code: -32603,
          message: error.message || 'Internal error',
          details: config.environment === 'development' ? error.stack : undefined
        }
      };
    }
  }

  private async callTool(toolName: string, args: Record<string, any>): Promise<MCPResponse> {
    try {
      let result: any;

      switch (toolName) {
        case 'query_analytics':
          result = await this.queryAnalyticsTool.execute(args);
          break;

        case 'get_forecast':
          result = await this.getForecastTool.execute(args);
          break;

        case 'get_anomalies':
          result = await this.getAnomaliesTool.execute(args);
          break;

        default:
          return {
            error: {
              code: -32601,
              message: `Unknown tool: ${toolName}`
            }
          };
      }

      return {
        result
      };
    } catch (error: any) {
      // Handle validation errors
      if (error.message?.includes('Invalid') || error.message?.includes('not found')) {
        return {
          error: {
            code: -32602,
            message: error.message
          }
        };
      }

      // Handle timeout errors
      if (error.message?.includes('QUERY_TIMEOUT')) {
        return {
          error: {
            code: 504,
            message: 'Query exceeded 30 second timeout. Try narrowing your query.'
          }
        };
      }

      // Generic error
      return {
        error: {
          code: -32603,
          message: error.message || 'Tool execution failed'
        }
      };
    }
  }

  start(): void {
    const host = '0.0.0.0'; // Listen on all interfaces for Cloud Run
    this.app.listen(config.port, host, () => {
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'MCP Server started',
        component: 'mcp-server',
        host: host,
        port: config.port,
        environment: config.environment,
        timestamp: new Date().toISOString()
      }));
    });
  }

  getApp(): express.Application {
    return this.app;
  }
}
