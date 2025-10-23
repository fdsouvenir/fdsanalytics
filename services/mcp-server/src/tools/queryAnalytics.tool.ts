// Query Analytics Tool
// Main tool for querying sales and quantity data

import { BigQueryClient, QueryResult } from '../bigquery/BigQueryClient';
import { Validator } from '../bigquery/Validator';
import { TimeframeConverter } from '../bigquery/TimeframeConverter';
import { QueryAnalyticsParams, QueryAnalyticsParamsSchema } from '../schemas/paramSchemas';
import { config } from '../config/config';

export interface QueryAnalyticsResult {
  rows: any[];
  totalRows: number;
  executionTimeMs: number;
  metadata?: {
    timeframe: {
      start: string;
      end: string;
    };
    filters?: Record<string, any>;
  };
}

export class QueryAnalyticsTool {
  private bqClient: BigQueryClient;
  private validator: Validator;
  private timeframeConverter: TimeframeConverter;

  constructor(bqClient: BigQueryClient, validator: Validator) {
    this.bqClient = bqClient;
    this.validator = validator;
    this.timeframeConverter = new TimeframeConverter();
  }

  async execute(params: any): Promise<QueryAnalyticsResult> {
    const startTime = Date.now();

    // Validate schema
    const validatedParams = QueryAnalyticsParamsSchema.parse(params);

    // Validate against live data
    const validationResult = await this.validator.validateQueryAnalytics(validatedParams);
    if (!validationResult.valid) {
      throw new Error(validationResult.error || 'Validation failed');
    }

    // Convert timeframe to dates
    const dateRange = this.timeframeConverter.convert(validatedParams.timeframe);

    // Build parameters for stored procedure
    // IMPORTANT: Order must match stored procedure signature exactly!
    // The procedure signature is:
    // (metric_name, start_date, end_date, aggregation, primary_category, subcategory,
    //  item_name, group_by_fields, baseline_start_date, baseline_end_date,
    //  max_rows, order_by_field, order_direction, OUT result_table)

    let baselineStartDate = null;
    let baselineEndDate = null;

    // Handle baseline comparison if provided
    if (validatedParams.comparison?.baselineTimeframe) {
      const baselineRange = this.timeframeConverter.convert(
        validatedParams.comparison.baselineTimeframe
      );
      baselineStartDate = baselineRange.startDate;
      baselineEndDate = baselineRange.endDate;
    }

    // MUST match stored procedure signature order EXACTLY:
    // (metric_name, start_date, end_date, primary_category, subcategory, item_name,
    //  aggregation, group_by_fields, baseline_start_date, baseline_end_date,
    //  max_rows, order_by_field, order_direction, OUT result_table_name)
    const procedureParams: Record<string, any> = {
      metric_name: validatedParams.metric,
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      primary_category: validatedParams.filters?.primaryCategory || null,
      subcategory: validatedParams.filters?.subcategory || null,
      item_name: validatedParams.filters?.itemName || null,
      aggregation: validatedParams.aggregation.toUpperCase(),
      group_by_fields: validatedParams.groupBy?.join(',') || null,
      baseline_start_date: baselineStartDate,
      baseline_end_date: baselineEndDate,
      max_rows: validatedParams.limit || config.maxQueryResults,
      order_by_field: validatedParams.orderBy?.field || 'metric_value',
      order_direction: validatedParams.orderBy?.direction?.toUpperCase() || 'DESC'
    }

    // Call stored procedure
    try {
      const result = await this.bqClient.callProcedure(
        `${config.bqDatasetAnalytics}.query_metrics`,
        procedureParams
      );

      const executionTimeMs = Date.now() - startTime;

      return {
        rows: result.rows,
        totalRows: result.totalRows,
        executionTimeMs,
        metadata: {
          timeframe: {
            start: dateRange.startDate,
            end: dateRange.endDate
          },
          filters: validatedParams.filters
        }
      };
    } catch (error: any) {
      // Transform BigQuery errors to user-friendly messages
      if (error.message?.includes('Invalid primary_category')) {
        const categories = await this.validator.getAvailableCategories();
        throw new Error(
          `Invalid category. Available categories: ${categories.join(', ')}`
        );
      }

      throw error;
    }
  }
}
