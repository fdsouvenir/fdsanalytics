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
  private customerId: string;

  constructor(
    projectId: string = 'fdsanalytics',
    dataset: string = 'restaurant_analytics',
    customerId: string = 'senso-sushi'
  ) {
    this.projectId = projectId;
    this.dataset = dataset;
    this.customerId = customerId;
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
   * Show daily sales - HYBRID CACHE (fast path from insights, slow path from query_metrics)
   */
  private async showDailySales(args: {
    startDate: string;
    endDate: string;
    category?: string;
  }): Promise<ToolResult> {
    const { primaryCategory, subcategory } = this.parseCategory(args.category);

    // HYBRID CACHE: Check if date range is covered in insights
    const coverage = await this.checkInsightsCoverage(args.startDate, args.endDate);

    // FAST PATH: Use insights cache if fully covered
    if (coverage.isFullyCovered) {
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Using FAST PATH (insights cache) for show_daily_sales',
        startDate: args.startDate,
        endDate: args.endDate,
        coveragePercent: coverage.coveragePercent
      }));

      return this.callStoredProcedure(
        'sp_get_daily_summary',
        {
          start_date: args.startDate,
          end_date: args.endDate,
          customer_id: this.customerId,
          primary_category: primaryCategory,
          subcategory: subcategory
        },
        'insights'
      );
    }

    // SLOW PATH: Fall back to raw metrics aggregation
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Using SLOW PATH (query_metrics) for show_daily_sales',
      startDate: args.startDate,
      endDate: args.endDate,
      coveragePercent: coverage.coveragePercent,
      reason: 'Date range not fully cached'
    }));

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
   * Show top items - HYBRID CACHE (fast path from insights, slow path from query_metrics)
   */
  private async showTopItems(args: {
    limit: number;
    startDate: string;
    endDate: string;
    category?: string;
  }): Promise<ToolResult> {
    const { primaryCategory, subcategory } = this.parseCategory(args.category);

    // HYBRID CACHE: Check if date range is covered in insights
    const coverage = await this.checkInsightsCoverage(args.startDate, args.endDate);

    // FAST PATH: Use insights cache if fully covered
    if (coverage.isFullyCovered) {
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Using FAST PATH (insights cache) for show_top_items',
        startDate: args.startDate,
        endDate: args.endDate,
        coveragePercent: coverage.coveragePercent
      }));

      return this.callStoredProcedure(
        'sp_get_top_items_from_insights',
        {
          start_date: args.startDate,
          end_date: args.endDate,
          customer_id: this.customerId,
          primary_category: primaryCategory,
          subcategory: subcategory,
          item_limit: args.limit
        },
        'insights'
      );
    }

    // SLOW PATH: Fall back to raw metrics aggregation
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Using SLOW PATH (query_metrics) for show_top_items',
      startDate: args.startDate,
      endDate: args.endDate,
      coveragePercent: coverage.coveragePercent,
      reason: 'Date range not fully cached'
    }));

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
   * Show category breakdown - HYBRID CACHE (fast path from insights, slow path from query_metrics)
   */
  private async showCategoryBreakdown(args: {
    startDate: string;
    endDate: string;
    includeBeer?: boolean;
  }): Promise<ToolResult> {
    // HYBRID CACHE: Check if date range is covered in insights
    const coverage = await this.checkInsightsCoverage(args.startDate, args.endDate);

    // FAST PATH: Use insights cache if fully covered
    if (coverage.isFullyCovered) {
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Using FAST PATH (insights cache) for show_category_breakdown',
        startDate: args.startDate,
        endDate: args.endDate,
        coveragePercent: coverage.coveragePercent
      }));

      return this.callStoredProcedure(
        'sp_get_category_trends',
        {
          start_date: args.startDate,
          end_date: args.endDate,
          customer_id: this.customerId
        },
        'insights'
      );
    }

    // SLOW PATH: Fall back to raw metrics aggregation
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Using SLOW PATH (query_metrics) for show_category_breakdown',
      startDate: args.startDate,
      endDate: args.endDate,
      coveragePercent: coverage.coveragePercent,
      reason: 'Date range not fully cached'
    }));

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
   * Check if date range is covered in insights cache
   */
  private async checkInsightsCoverage(
    startDate: string,
    endDate: string
  ): Promise<{ isFullyCovered: boolean; coveragePercent: number }> {
    const checkStart = Date.now();

    try {
      const query = `
        DECLARE result_table STRING;
        CALL \`${this.projectId}.insights.sp_check_insights_coverage\`(
          DATE('${startDate}'),
          DATE('${endDate}'),
          '${this.customerId}',
          result_table
        );
        EXECUTE IMMEDIATE FORMAT('SELECT is_fully_covered, coverage_percent FROM %s', result_table);
      `;

      const [rows] = await this.bqClient.query({
        query,
        location: 'us-central1',
        jobTimeoutMs: 10000
      });

      const result = rows[0];
      const checkDuration = Date.now() - checkStart;

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Checked insights cache coverage',
        startDate,
        endDate,
        isFullyCovered: result.is_fully_covered,
        coveragePercent: result.coverage_percent,
        checkDurationMs: checkDuration
      }));

      return {
        isFullyCovered: result.is_fully_covered,
        coveragePercent: parseFloat(result.coverage_percent) || 0
      };
    } catch (error: any) {
      console.warn('Failed to check insights coverage, defaulting to slow path:', error.message);
      return { isFullyCovered: false, coveragePercent: 0 };
    }
  }

  /**
   * Call a BigQuery stored procedure (generic)
   */
  private async callStoredProcedure(
    procedureName: string,
    params: Record<string, any>,
    dataset: string = this.dataset
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Build CALL statement
      const paramNames = Object.keys(params);
      const paramPlaceholders = paramNames.map(name => `@${name}`).join(', ');

      const callStatement = `
        DECLARE result_table STRING;
        CALL \`${this.projectId}.${dataset}.${procedureName}\`(
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
