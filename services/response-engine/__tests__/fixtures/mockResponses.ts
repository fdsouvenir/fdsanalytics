/**
 * Mock responses for testing
 */

export const mockMCPToolsList = [
  {
    name: 'query_analytics',
    description: 'Query sales and quantity data with flexible filtering',
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', enum: ['net_sales', 'quantity_sold'] },
        timeframe: { type: 'object' },
        aggregation: { type: 'string' }
      },
      required: ['metric', 'timeframe', 'aggregation']
    }
  },
  {
    name: 'get_forecast',
    description: 'Get sales forecast for next 7 days',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', default: 7 }
      }
    }
  },
  {
    name: 'get_anomalies',
    description: 'Get detected anomalies in sales',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', default: 7 }
      }
    }
  }
];

export const mockQueryAnalyticsResult = {
  rows: [
    { primary_category: '(Beer)', total: 5234.50 },
    { primary_category: '(Sushi)', total: 8123.75 },
    { primary_category: '(Food)', total: 12456.25 }
  ],
  totalRows: 3,
  executionTimeMs: 245
};

export const mockForecastResult = {
  forecasts: [
    {
      targetDate: '2025-10-23',
      predictedSales: 4500.00,
      confidenceLow: 4000.00,
      confidenceHigh: 5000.00,
      confidenceScore: 0.85
    },
    {
      targetDate: '2025-10-24',
      predictedSales: 4800.00,
      confidenceLow: 4200.00,
      confidenceHigh: 5400.00,
      confidenceScore: 0.82
    }
  ]
};

export const mockConversationContext = {
  relevantMessages: [
    {
      role: 'user' as const,
      content: 'What were sales today?',
      timestamp: new Date('2025-10-22T10:00:00Z')
    },
    {
      role: 'assistant' as const,
      content: 'Today\'s sales were $5,234.',
      timestamp: new Date('2025-10-22T10:00:05Z')
    }
  ],
  summary: 'User asking about daily sales'
};

export const mockTenantConfig = {
  tenantId: 'senso-sushi',
  businessName: 'Senso Sushi',
  bqProject: 'fdsanalytics',
  bqDataset: 'restaurant_analytics',
  timezone: 'America/Chicago',
  currency: 'USD',
  createdAt: new Date('2025-01-01'),
  status: 'active' as const
};

export const mockGoogleChatWebhook = {
  type: 'MESSAGE',
  message: {
    name: 'spaces/AAAAA/messages/BBBBB',
    text: 'What were beer sales yesterday?',
    thread: { name: 'spaces/AAAAA/threads/CCCCC' },
    sender: {
      name: 'users/12345',
      displayName: 'Test User'
    }
  },
  space: {
    name: 'spaces/AAAAA',
    type: 'ROOM'
  }
};
