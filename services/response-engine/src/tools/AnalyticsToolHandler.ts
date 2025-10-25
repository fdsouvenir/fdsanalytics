// Analytics Tool Handler
// Executes intent-based functions by calling BigQuery stored procedures directly
// Replaces MCP server layer for performance (eliminates HTTP overhead)

import { BigQuery } from '@google-cloud/bigquery';

export interface ToolResult {
  rows: any[];
  totalRows: number;
  executionTimeMs: number;
}

export class AnalyticsToolHandler {
  private bqClient: BigQuery;
  private projectId: string;
  private dataset: string;

  constructor(projectId: string = 'fdsanalytics', dataset: string = 'restaurant_analytics') {
    this.projectId = projectId;
    this.dataset = dataset;
    this.bqClient = new BigQuery({ projectId });
  }

  /**
   * Execute an intent function
   */
  async execute(functionName: string, args: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      let result: ToolResult;

      switch (functionName) {
        case 'show_daily_sales':
          result = await this.showDailySales(args as any);
          break;
        case 'show_top_items':
          result = await this.showTopItems(args as any);
          break;
        case 'show_category_breakdown':
          result = await this.showCategoryBreakdown(args as any);
          break;
        case 'get_total_sales':
          result = await this.getTotalSales(args as any);
          break;
        case 'find_peak_day':
          result = await this.findPeakDay(args as any);
          break;
        case 'compare_day_types':
          result = await this.compareDayTypes(args as any);
          break;
        case 'track_item_performance':
          result = await this.trackItemPerformance(args as any);
          break;
        default:
          throw new Error(`Unknown function: ${functionName}`);
      }

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Intent function executed',
        function: functionName,
        executionTimeMs: Date.now() - startTime,
        rowCount: result.totalRows
      }));

      return result;
    } catch (error: any) {
      console.error(`Error executing ${functionName}:`, error);
      throw error;
    }
  }

  /**
   * Show daily sales - calls query_metrics stored procedure
   */
  private async showDailySales(args: {
    startDate: string;
    endDate: string;
    category?: string;
  }): Promise<ToolResult> {
    const { primaryCategory, subcategory } = this.parseCategory(args.category);

    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate,
      end_date: args.endDate,
      primary_category: primaryCategory,
      subcategory: subcategory,
      item_name: null,
      aggregation: 'SUM',
      group_by_fields: 'date',
      baseline_start_date: null,
      baseline_end_date: null,
      max_rows: 100,
      order_by_field: 'date',
      order_direction: 'ASC'
    });
  }

  /**
   * Show top items
   */
  private async showTopItems(args: {
    limit: number;
    startDate: string;
    endDate: string;
    category?: string;
  }): Promise<ToolResult> {
    const { primaryCategory, subcategory } = this.parseCategory(args.category);

    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate,
      end_date: args.endDate,
      primary_category: primaryCategory,
      subcategory: subcategory,
      item_name: null,
      aggregation: 'SUM',
      group_by_fields: 'item',
      baseline_start_date: null,
      baseline_end_date: null,
      max_rows: args.limit,
      order_by_field: 'metric_value',
      order_direction: 'DESC'
    });
  }

  /**
   * Show category breakdown
   */
  private async showCategoryBreakdown(args: {
    startDate: string;
    endDate: string;
    includeBeer?: boolean;
  }): Promise<ToolResult> {
    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate,
      end_date: args.endDate,
      primary_category: null,
      subcategory: null,
      item_name: null,
      aggregation: 'SUM',
      group_by_fields: 'category',
      baseline_start_date: null,
      baseline_end_date: null,
      max_rows: 100,
      order_by_field: 'metric_value',
      order_direction: 'DESC'
    });
  }

  /**
   * Get total sales
   */
  private async getTotalSales(args: {
    startDate: string;
    endDate: string;
    category?: string;
  }): Promise<ToolResult> {
    const { primaryCategory, subcategory } = this.parseCategory(args.category);

    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate,
      end_date: args.endDate,
      primary_category: primaryCategory,
      subcategory: subcategory,
      item_name: null,
      aggregation: 'SUM',
      group_by_fields: null,
      baseline_start_date: null,
      baseline_end_date: null,
      max_rows: 1,
      order_by_field: 'metric_value',
      order_direction: 'DESC'
    });
  }

  /**
   * Find peak day (highest or lowest)
   */
  private async findPeakDay(args: {
    startDate: string;
    endDate: string;
    category?: string;
    type: 'highest' | 'lowest';
  }): Promise<ToolResult> {
    const { primaryCategory, subcategory } = this.parseCategory(args.category);

    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate,
      end_date: args.endDate,
      primary_category: primaryCategory,
      subcategory: subcategory,
      item_name: null,
      aggregation: 'SUM',
      group_by_fields: 'date',
      baseline_start_date: null,
      baseline_end_date: null,
      max_rows: 1,
      order_by_field: 'metric_value',
      order_direction: args.type === 'highest' ? 'DESC' : 'ASC'
    });
  }

  /**
   * Compare day types (weekday vs weekend, etc.)
   */
  private async compareDayTypes(args: {
    startDate: string;
    endDate: string;
    comparison: 'weekday_vs_weekend' | 'by_day_of_week';
    category?: string;
  }): Promise<ToolResult> {
    // For now, get daily data and let Gemini do the comparison in text
    // Future: could add specialized stored procedure for this
    const { primaryCategory, subcategory } = this.parseCategory(args.category);

    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate,
      end_date: args.endDate,
      primary_category: primaryCategory,
      subcategory: subcategory,
      item_name: null,
      aggregation: 'SUM',
      group_by_fields: 'date',
      baseline_start_date: null,
      baseline_end_date: null,
      max_rows: 100,
      order_by_field: 'date',
      order_direction: 'ASC'
    });
  }

  /**
   * Track item performance
   */
  private async trackItemPerformance(args: {
    itemName: string;
    startDate: string;
    endDate: string;
  }): Promise<ToolResult> {
    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate,
      end_date: args.endDate,
      primary_category: null,
      subcategory: null,
      item_name: args.itemName,
      aggregation: 'SUM',
      group_by_fields: 'date',
      baseline_start_date: null,
      baseline_end_date: null,
      max_rows: 100,
      order_by_field: 'date',
      order_direction: 'ASC'
    });
  }

  /**
   * Parse category string into primary/sub category
   * Categories in parentheses like "(Beer)" are primary categories
   * Others like "Bottle Beer" are subcategories
   */
  private parseCategory(category?: string): { primaryCategory: string | null; subcategory: string | null } {
    if (!category) {
      return { primaryCategory: null, subcategory: null };
    }

    // Check if it's a primary category (in parentheses)
    if (category.startsWith('(') && category.endsWith(')')) {
      return { primaryCategory: category, subcategory: null };
    }

    // Otherwise it's a subcategory
    return { primaryCategory: null, subcategory: category };
  }

  /**
   * Call a BigQuery stored procedure
   */
  private async callStoredProcedure(
    procedureName: string,
    params: Record<string, any>
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Build CALL statement
      const paramNames = Object.keys(params);
      const paramPlaceholders = paramNames.map(name => `@${name}`).join(', ');

      const callStatement = `
        DECLARE result_table STRING;
        CALL \`${this.projectId}.${this.dataset}.${procedureName}\`(
          ${paramPlaceholders},
          result_table
        );
        EXECUTE IMMEDIATE FORMAT('SELECT * FROM %s', result_table);
      `;

      // Build type map for null values
      const types: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value === null) {
          types[key] = 'STRING';  // All our null params are strings
        }
      }

      // Execute query with parameters
      const [rows] = await this.bqClient.query({
        query: callStatement,
        params: params,
        types: types,
        location: 'us-central1',
        jobTimeoutMs: 30000
      });

      return {
        rows,
        totalRows: rows.length,
        executionTimeMs: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('BigQuery error:', error);
      throw new Error(`BigQuery error: ${error.message}`);
    }
  }
}
