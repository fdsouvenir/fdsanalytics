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

/**
 * Chart test data for integration tests
 */
export const mockDateSeriesData = {
  rows: [
    { report_date: new Date('2025-01-20T00:00:00Z'), net_sales: 4500.00 },
    { report_date: new Date('2025-01-21T00:00:00Z'), net_sales: 4800.00 },
    { report_date: new Date('2025-01-22T00:00:00Z'), net_sales: 5200.00 },
    { report_date: new Date('2025-01-23T00:00:00Z'), net_sales: 4900.00 }
  ],
  totalRows: 4,
  executionTimeMs: 180
};

export const mockDayOfWeekData = {
  rows: [
    { day_of_week: new Date('2025-10-20T00:00:00Z'), total: 5000.00 }, // Monday
    { day_of_week: new Date('2025-10-21T00:00:00Z'), total: 5500.00 }, // Tuesday
    { day_of_week: new Date('2025-10-22T00:00:00Z'), total: 6000.00 }, // Wednesday
    { day_of_week: new Date('2025-10-23T00:00:00Z'), total: 6200.00 }, // Thursday
    { day_of_week: new Date('2025-10-24T00:00:00Z'), total: 7000.00 }  // Friday
  ],
  totalRows: 5,
  executionTimeMs: 195
};

export const mockCategoryData = {
  rows: [
    { primary_category: '(Beer)', net_sales: 5234.50 },
    { primary_category: '(Sushi)', net_sales: 8123.75 },
    { primary_category: '(Food)', net_sales: 12456.25 },
    { primary_category: '(Wine)', net_sales: 3456.00 }
  ],
  totalRows: 4,
  executionTimeMs: 150
};

export const mockSubcategoryData = {
  rows: [
    { subcategory: 'Draft Beer', quantity_sold: 45 },
    { subcategory: 'Bottle Beer', quantity_sold: 32 },
    { subcategory: 'Signature Rolls', quantity_sold: 28 },
    { subcategory: 'Classic Rolls', quantity_sold: 35 }
  ],
  totalRows: 4,
  executionTimeMs: 160
};

export const mockNumberLabelData = {
  rows: [
    { item_name: 'Item 1', quantity_sold: 10 },
    { item_name: 'Item 2', quantity_sold: 20 },
    { item_name: 'Item 3', quantity_sold: 30 },
    { item_name: 'Item 4', quantity_sold: 40 }
  ],
  totalRows: 4,
  executionTimeMs: 140
};
