// Query Analytics Tool
// Main tool for querying sales and quantity data

import { BigQueryClient, QueryResult } from '../bigquery/BigQueryClient';
import { Validator } from '../bigquery/Validator';
import { TimeframeConverter } from '../bigquery/TimeframeConverter';
import { QueryAnalyticsParams, QueryAnalyticsParamsSchema } from '../schemas/paramSchemas';
import { config } from '../config/config';
import { PerformanceTracker } from '../analytics/PerformanceTracker';

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
  private performanceTracker: PerformanceTracker;

  constructor(
    bqClient: BigQueryClient,
    validator: Validator,
    tenantId: string = 'senso-sushi',
    userId?: string
  ) {
    this.bqClient = bqClient;
    this.validator = validator;
    this.timeframeConverter = new TimeframeConverter();
    this.performanceTracker = new PerformanceTracker();
  }

  async execute(params: any, tenantId: string = 'senso-sushi', userId?: string): Promise<QueryAnalyticsResult> {
    const startTime = Date.now();
    let resultStatus: 'success' | 'error' | 'timeout' | 'empty' = 'success';
    let errorMessage: string | undefined;
    let rows: any[] = [];
    let executionTimeMs = 0;
    let validatedParams: any;
    let dateRange: any;

    try {
      // Validate schema
      validatedParams = QueryAnalyticsParamsSchema.parse(params);

      // Validate against live data
      const validationResult = await this.validator.validateQueryAnalytics(validatedParams);
      if (!validationResult.valid) {
        throw new Error(validationResult.error || 'Validation failed');
      }

      // Convert timeframe to dates
      dateRange = this.timeframeConverter.convert(validatedParams.timeframe);

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
      const result = await this.bqClient.callProcedure(
        `${config.bqDatasetAnalytics}.query_metrics`,
        procedureParams
      );

      executionTimeMs = Date.now() - startTime;
      rows = result.rows;

      // Determine result status
      if (rows.length === 0) {
        resultStatus = 'empty';
      } else {
        resultStatus = 'success';
      }

      // Track performance (fire and forget - don't block response)
      this.trackPerformance({
        tenantId,
        userId,
        validatedParams,
        dateRange,
        executionTimeMs,
        rowsReturned: rows.length,
        resultStatus
      }).catch(err => {
        console.error('Performance tracking failed (non-blocking):', err.message);
      });

      return {
        rows,
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
      executionTimeMs = Date.now() - startTime;

      // Determine error type
      if (error.message?.includes('timeout') || error.message?.includes('DEADLINE_EXCEEDED')) {
        resultStatus = 'timeout';
        errorMessage = 'Query timeout';
      } else {
        resultStatus = 'error';
        errorMessage = error.message;
      }

      // Track failed query
      this.trackPerformance({
        tenantId,
        userId,
        validatedParams,
        dateRange,
        executionTimeMs,
        rowsReturned: 0,
        resultStatus,
        errorMessage
      }).catch(err => {
        console.error('Performance tracking failed (non-blocking):', err.message);
      });

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

  /**
   * Track query performance (async, non-blocking)
   */
  private async trackPerformance(data: {
    tenantId: string;
    userId?: string;
    validatedParams: any;
    dateRange: any;
    executionTimeMs: number;
    rowsReturned: number;
    resultStatus: 'success' | 'error' | 'timeout' | 'empty';
    errorMessage?: string;
  }): Promise<void> {
    const daysInRange = PerformanceTracker.calculateDaysInRange(
      data.dateRange.startDate,
      data.dateRange.endDate
    );

    await this.performanceTracker.trackQuery({
      tenantId: data.tenantId,
      userId: data.userId,
      toolName: 'query_analytics',
      metricName: data.validatedParams.metric,
      aggregation: data.validatedParams.aggregation,
      primaryCategory: data.validatedParams.filters?.primaryCategory,
      subcategory: data.validatedParams.filters?.subcategory,
      itemName: data.validatedParams.filters?.itemName,
      startDate: data.dateRange.startDate,
      endDate: data.dateRange.endDate,
      daysInRange,
      groupByFields: data.validatedParams.groupBy?.join(','),
      orderByField: data.validatedParams.orderBy?.field,
      orderDirection: data.validatedParams.orderBy?.direction,
      limitRows: data.validatedParams.limit,
      executionTimeMs: data.executionTimeMs,
      rowsReturned: data.rowsReturned,
      resultStatus: data.resultStatus,
      errorMessage: data.errorMessage
    });
  }
}
