// MCP Tool Definitions
// Defines the three tools exposed via MCP protocol

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export const QUERY_ANALYTICS_TOOL: MCPTool = {
  name: 'query_analytics',
  description: 'Query sales and quantity data with flexible filtering, grouping, and comparison. ' +
               'Supports filtering by category, date ranges, and comparisons with baseline periods.',
  inputSchema: {
    type: 'object',
    properties: {
      metric: {
        type: 'string',
        enum: ['net_sales', 'quantity_sold'],
        description: 'The metric to query'
      },
      timeframe: {
        type: 'object',
        description: 'Time range for the query',
        properties: {
          type: {
            type: 'string',
            enum: ['absolute', 'relative']
          },
          start: {
            type: 'string',
            description: 'ISO date for absolute timeframe (YYYY-MM-DD)'
          },
          end: {
            type: 'string',
            description: 'ISO date for absolute timeframe (YYYY-MM-DD)'
          },
          relative: {
            type: 'string',
            enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_7_days', 'last_30_days']
          }
        },
        required: ['type']
      },
      filters: {
        type: 'object',
        description: 'Optional filters',
        properties: {
          primaryCategory: {
            type: 'string',
            description: 'Filter by primary category (e.g., "(Beer)", "(Sushi)")'
          },
          subcategory: {
            type: 'string',
            description: 'Filter by subcategory (e.g., "Bottle Beer", "Signature Rolls")'
          },
          itemName: {
            type: 'string',
            description: 'Filter by specific item name'
          }
        }
      },
      aggregation: {
        type: 'string',
        enum: ['sum', 'avg', 'count', 'min', 'max'],
        description: 'Aggregation function to apply'
      },
      groupBy: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['date', 'category', 'subcategory', 'item']
        },
        description: 'Fields to group results by'
      },
      comparison: {
        type: 'object',
        description: 'Optional baseline comparison',
        properties: {
          baselineTimeframe: {
            type: 'object',
            description: 'Baseline period for comparison'
          }
        }
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 100,
        description: 'Maximum number of rows to return'
      },
      orderBy: {
        type: 'object',
        properties: {
          field: {
            type: 'string'
          },
          direction: {
            type: 'string',
            enum: ['asc', 'desc']
          }
        }
      }
    },
    required: ['metric', 'timeframe', 'aggregation']
  }
};

export const GET_FORECAST_TOOL: MCPTool = {
  name: 'get_forecast',
  description: '7-day sales forecasting based on historical day-of-week patterns. ' +
               'Returns predicted sales with confidence intervals.',
  inputSchema: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 14,
        default: 7,
        description: 'Number of days to forecast (default: 7, max: 14)'
      }
    },
    required: []
  }
};

export const GET_ANOMALIES_TOOL: MCPTool = {
  name: 'get_anomalies',
  description: 'Detect anomalies in sales data using ±40%/±60% thresholds. ' +
               'Compares recent data against historical day-of-week averages.',
  inputSchema: {
    type: 'object',
    properties: {
      days: {
        type: 'integer',
        minimum: 1,
        maximum: 90,
        default: 7,
        description: 'Number of days back to check for anomalies'
      }
    },
    required: []
  }
};

export const MCP_TOOLS: MCPTool[] = [
  QUERY_ANALYTICS_TOOL,
  GET_FORECAST_TOOL,
  GET_ANOMALIES_TOOL
];
