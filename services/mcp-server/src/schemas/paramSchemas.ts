// Parameter validation schemas using Zod
import { z } from 'zod';

// Timeframe schema
export const TimeframeSchema = z.object({
  type: z.enum(['absolute', 'relative']),
  start: z.string().optional(),
  end: z.string().optional(),
  relative: z.enum([
    'today',
    'yesterday',
    'this_week',
    'last_week',
    'this_month',
    'last_month',
    'last_7_days',
    'last_30_days'
  ]).optional()
});

// Filters schema
export const FiltersSchema = z.object({
  primaryCategory: z.string().optional(),
  subcategory: z.string().optional(),
  itemName: z.string().optional()
}).optional();

// Aggregation types
export const AggregationSchema = z.enum(['sum', 'avg', 'count', 'min', 'max']);

// Group by fields
export const GroupBySchema = z.array(
  z.enum(['date', 'category', 'subcategory', 'item'])
).optional();

// Order by schema
export const OrderBySchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc'])
}).optional();

// Comparison schema
export const ComparisonSchema = z.object({
  baselineTimeframe: TimeframeSchema
}).optional();

// Query Analytics Parameters
export const QueryAnalyticsParamsSchema = z.object({
  metric: z.enum(['net_sales', 'quantity_sold']),
  timeframe: TimeframeSchema,
  filters: FiltersSchema,
  aggregation: AggregationSchema,
  groupBy: GroupBySchema,
  comparison: ComparisonSchema,
  limit: z.number().int().min(1).max(100).optional().default(100),
  orderBy: OrderBySchema
});

export type QueryAnalyticsParams = z.infer<typeof QueryAnalyticsParamsSchema>;

// Get Forecast Parameters
export const GetForecastParamsSchema = z.object({
  days: z.number().int().min(1).max(14).optional().default(7)
});

export type GetForecastParams = z.infer<typeof GetForecastParamsSchema>;

// Get Anomalies Parameters
export const GetAnomaliesParamsSchema = z.object({
  days: z.number().int().min(1).max(90).optional().default(7)
});

export type GetAnomaliesParams = z.infer<typeof GetAnomaliesParamsSchema>;
