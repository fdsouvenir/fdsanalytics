// Performance Tracker for Query Analytics
// Tracks query execution metrics to BigQuery for optimization

import { BigQuery } from '@google-cloud/bigquery';
import { config } from '../config/config';
import { v4 as uuidv4 } from 'uuid';

export interface QueryPerformanceData {
  // Identification
  queryId?: string;  // Auto-generated if not provided
  tenantId: string;
  userId?: string;

  // Query details
  toolName: string;
  metricName?: string;
  aggregation?: string;

  // Filters
  primaryCategory?: string;
  subcategory?: string;
  itemName?: string;

  // Timeframe
  startDate?: string;  // ISO date
  endDate?: string;    // ISO date
  daysInRange?: number;

  // Grouping and ordering
  groupByFields?: string;  // Comma-separated
  orderByField?: string;
  orderDirection?: string;
  limitRows?: number;

  // Performance metrics
  executionTimeMs: number;
  rowsReturned: number;
  bytesScanned?: number;

  // Results
  resultStatus: 'success' | 'error' | 'timeout' | 'empty';
  errorMessage?: string;
}

export class PerformanceTracker {
  private bqClient: BigQuery;
  private datasetId: string;
  private tableId: string;

  constructor() {
    this.bqClient = new BigQuery({
      projectId: config.projectId
    });
    this.datasetId = 'insights';
    this.tableId = 'query_performance';
  }

  /**
   * Track a query execution
   */
  async trackQuery(data: QueryPerformanceData): Promise<void> {
    try {
      const queryId = data.queryId || uuidv4();
      const now = new Date();

      // Prepare row for insertion
      const row = {
        query_id: queryId,
        tenant_id: data.tenantId,
        user_id: data.userId || null,

        // Query details
        tool_name: data.toolName,
        metric_name: data.metricName || null,
        aggregation: data.aggregation || null,

        // Filters
        primary_category: data.primaryCategory || null,
        subcategory: data.subcategory || null,
        item_name: data.itemName || null,

        // Timeframe
        start_date: data.startDate || null,
        end_date: data.endDate || null,
        days_in_range: data.daysInRange || null,

        // Grouping and ordering
        group_by_fields: data.groupByFields || null,
        order_by_field: data.orderByField || null,
        order_direction: data.orderDirection || null,
        limit_rows: data.limitRows || null,

        // Performance metrics
        execution_time_ms: data.executionTimeMs,
        rows_returned: data.rowsReturned,
        bytes_scanned: data.bytesScanned || null,

        // Results
        result_status: data.resultStatus,
        error_message: data.errorMessage || null,

        // Timestamps
        query_timestamp: now.toISOString(),
        partition_date: now.toISOString().split('T')[0]  // YYYY-MM-DD
      };

      // Insert into BigQuery
      await this.bqClient
        .dataset(this.datasetId)
        .table(this.tableId)
        .insert([row]);

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Query performance tracked',
        component: 'PerformanceTracker',
        queryId,
        toolName: data.toolName,
        executionTimeMs: data.executionTimeMs,
        resultStatus: data.resultStatus
      }));
    } catch (error: any) {
      // Don't fail the query if tracking fails
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'Failed to track query performance',
        component: 'PerformanceTracker',
        error: error.message
      }));
    }
  }

  /**
   * Get performance summary for a tenant
   */
  async getSummary(tenantId: string, days: number = 7): Promise<any> {
    try {
      const query = `
        SELECT
          tool_name,
          COUNT(*) as total_queries,
          COUNTIF(result_status = 'success') as successful_queries,
          COUNTIF(result_status = 'error') as failed_queries,
          COUNTIF(result_status = 'timeout') as timeout_queries,
          AVG(execution_time_ms) as avg_execution_time_ms,
          APPROX_QUANTILES(execution_time_ms, 100)[OFFSET(95)] as p95_execution_time_ms,
          AVG(rows_returned) as avg_rows_returned
        FROM \`${config.projectId}.${this.datasetId}.${this.tableId}\`
        WHERE
          tenant_id = @tenantId
          AND query_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
        GROUP BY tool_name
        ORDER BY total_queries DESC
      `;

      const [rows] = await this.bqClient.query({
        query,
        params: { tenantId, days }
      });

      return rows;
    } catch (error: any) {
      console.error('Failed to get performance summary', { error: error.message });
      throw error;
    }
  }

  /**
   * Get slow queries for a tenant
   */
  async getSlowQueries(tenantId: string, thresholdMs: number = 5000, limit: number = 10): Promise<any> {
    try {
      const query = `
        SELECT
          query_id,
          tool_name,
          metric_name,
          primary_category,
          subcategory,
          start_date,
          end_date,
          days_in_range,
          execution_time_ms,
          rows_returned,
          query_timestamp
        FROM \`${config.projectId}.${this.datasetId}.${this.tableId}\`
        WHERE
          tenant_id = @tenantId
          AND result_status = 'success'
          AND execution_time_ms > @thresholdMs
          AND query_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        ORDER BY execution_time_ms DESC
        LIMIT @limit
      `;

      const [rows] = await this.bqClient.query({
        query,
        params: { tenantId, thresholdMs, limit }
      });

      return rows;
    } catch (error: any) {
      console.error('Failed to get slow queries', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate days between two dates
   */
  static calculateDaysInRange(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }
}
