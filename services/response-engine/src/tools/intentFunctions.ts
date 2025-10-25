// Intent-Based Function Definitions
// Optimized for fast Gemini function calling (<1s vs 100s)
// Each function represents a specific user intent with minimal parameters

import { FunctionDeclaration, SchemaType } from '@google/generative-ai';

export const INTENT_FUNCTIONS: FunctionDeclaration[] = [
  {
    name: 'show_daily_sales',
    description: 'Show sales broken down by day for a date range. Use for queries like "sales from X to Y", "day to day sales", "daily breakdown"',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDate: {
          type: SchemaType.STRING,
          description: 'Start date in YYYY-MM-DD format'
        },
        endDate: {
          type: SchemaType.STRING,
          description: 'End date in YYYY-MM-DD format'
        },
        category: {
          type: SchemaType.STRING,
          description: 'Optional category filter like "(Beer)" for primary category or "Bottle Beer" for subcategory'
        }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'show_top_items',
    description: 'Show top N best-selling items. Use for queries like "top 10 items", "best sellers", "highest sales items"',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        limit: {
          type: SchemaType.INTEGER,
          description: 'Number of top items to show (e.g., 5, 10, 20)'
        },
        startDate: {
          type: SchemaType.STRING,
          description: 'Start date in YYYY-MM-DD format'
        },
        endDate: {
          type: SchemaType.STRING,
          description: 'End date in YYYY-MM-DD format'
        },
        category: {
          type: SchemaType.STRING,
          description: 'Optional category filter to show top items within that category'
        }
      },
      required: ['limit', 'startDate', 'endDate']
    }
  },
  {
    name: 'show_category_breakdown',
    description: 'Show sales broken down by category. Use for queries like "sales by category", "category breakdown", "which categories sold most"',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDate: {
          type: SchemaType.STRING,
          description: 'Start date in YYYY-MM-DD format'
        },
        endDate: {
          type: SchemaType.STRING,
          description: 'End date in YYYY-MM-DD format'
        },
        includeBeer: {
          type: SchemaType.BOOLEAN,
          description: 'Whether to include beer categories (default true)'
        }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'get_total_sales',
    description: 'Get total sales for a period. Use for queries like "total sales", "how much did we make", "revenue for"',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDate: {
          type: SchemaType.STRING,
          description: 'Start date in YYYY-MM-DD format'
        },
        endDate: {
          type: SchemaType.STRING,
          description: 'End date in YYYY-MM-DD format'
        },
        category: {
          type: SchemaType.STRING,
          description: 'Optional category filter to get total for specific category'
        }
      },
      required: ['startDate', 'endDate']
    }
  },
  {
    name: 'find_peak_day',
    description: 'Find the day with highest or lowest sales in a period. Use for queries like "best day", "worst day", "highest sales day", "slowest day"',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDate: {
          type: SchemaType.STRING,
          description: 'Start date in YYYY-MM-DD format'
        },
        endDate: {
          type: SchemaType.STRING,
          description: 'End date in YYYY-MM-DD format'
        },
        category: {
          type: SchemaType.STRING,
          description: 'Optional category filter'
        },
        type: {
          type: SchemaType.STRING,
          description: 'Whether to find highest or lowest day'
        }
      },
      required: ['startDate', 'endDate', 'type']
    }
  },
  {
    name: 'compare_day_types',
    description: 'Compare sales between different day types (weekday vs weekend, or specific days). Use for queries like "weekends vs weekdays", "Fridays vs Saturdays"',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        startDate: {
          type: SchemaType.STRING,
          description: 'Start date in YYYY-MM-DD format'
        },
        endDate: {
          type: SchemaType.STRING,
          description: 'End date in YYYY-MM-DD format'
        },
        comparison: {
          type: SchemaType.STRING,
          description: 'Type of day comparison'
        },
        category: {
          type: SchemaType.STRING,
          description: 'Optional category filter'
        }
      },
      required: ['startDate', 'endDate', 'comparison']
    }
  },
  {
    name: 'track_item_performance',
    description: 'Track performance of a specific item over time. Use for queries like "how is [item] selling", "track [item] sales", "[item] performance"',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        itemName: {
          type: SchemaType.STRING,
          description: 'Name of the item to track'
        },
        startDate: {
          type: SchemaType.STRING,
          description: 'Start date in YYYY-MM-DD format'
        },
        endDate: {
          type: SchemaType.STRING,
          description: 'End date in YYYY-MM-DD format'
        }
      },
      required: ['itemName', 'startDate', 'endDate']
    }
  }
];
