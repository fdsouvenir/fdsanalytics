// Analytics Tool Handler
// Executes intent-based functions by calling BigQuery stored procedures directly

import { BigQuery } from '@google-cloud/bigquery';
import { UserInputError, UserInputErrorCodes, TransientError, TransientErrorCodes } from '@fdsanalytics/shared';
import { TenantConfigService } from '../services/TenantConfigService';

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
  private primaryCategoriesCache: string[] | null = null;
  private latestDateCache: string | null = null;
  private firstDateCache: string | null = null;

  constructor(
    projectId: string,
    dataset: string,
    customerId: string
  ) {
    this.projectId = projectId;
    this.dataset = dataset;
    this.customerId = customerId;
    this.bqClient = new BigQuery({ projectId });
  }

  /**
   * Execute an intent function (static entry point for Tool Server)
   *
   * @param tenantId - Tenant identifier (e.g., "senso-sushi", "company-a.com")
   * @param functionName - Intent function name (e.g., "show_daily_sales")
   * @param args - Function arguments
   * @returns Tool execution result with rows and metadata
   */
  static async execute(tenantId: string, functionName: string, args: Record<string, any>): Promise<ToolResult> {
    // Get tenant configuration
    const tenantConfig = await TenantConfigService.getConfig(tenantId);

    // Create handler instance with tenant-specific config
    const handler = new AnalyticsToolHandler(
      tenantConfig.projectId,
      tenantConfig.datasetAnalytics,
      tenantConfig.customerId
    );

    // Execute the function via instance method
    return handler.executeInstance(functionName, args);
  }

  /**
   * Execute an intent function (instance method)
   */
  private async executeInstance(functionName: string, args: Record<string, any>): Promise<ToolResult> {
    const startTime = Date.now();

    // Log function call with full parameters
    console.log(JSON.stringify({
      severity: 'DEBUG',
      message: 'AnalyticsToolHandler.execute() called',
      functionName,
      args,
      customerId: this.customerId
    }));

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
        case 'compare_periods':
          result = await this.comparePeriods(args as any);
          break;
        default:
          throw new UserInputError(
            `Unknown function: ${functionName}`,
            UserInputErrorCodes.MISSING_REQUIRED_PARAM,
            { functionName },
            ['Available functions: show_daily_sales, show_top_items, show_category_breakdown, get_total_sales, find_peak_day, compare_day_types, track_item_performance, compare_periods']
          );
      }

      // Log successful execution with result summary
      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Intent function executed successfully',
        function: functionName,
        executionTimeMs: Date.now() - startTime,
        rowCount: result.totalRows,
        isEmpty: result.totalRows === 0,
        hasData: result.totalRows > 0
      }));

      return result;
    } catch (error: any) {
      // Log execution error with full details
      console.error(JSON.stringify({
        severity: 'ERROR',
        message: 'Intent function execution failed',
        function: functionName,
        args,
        errorType: error.constructor?.name || 'Unknown',
        errorMessage: error.message || String(error),
        errorCode: error.code,
        executionTimeMs: Date.now() - startTime
      }));

      // Re-throw if already a typed error
      if (error instanceof UserInputError || error instanceof TransientError) {
        throw error;
      }

      // Wrap untyped errors
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
    const { primaryCategory, subcategory } = await this.parseCategory(args.category);

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
    // Validate limit parameter
    if (!Number.isInteger(args.limit) || args.limit < 1) {
      throw new UserInputError(
        'Limit must be a positive integer (minimum 1)',
        UserInputErrorCodes.PARAM_OUT_OF_RANGE,
        { limit: args.limit },
        ['Try a value between 1 and 100', 'Example: limit=10 for top 10 items']
      );
    }

    if (args.limit > 1000) {
      throw new UserInputError(
        'Limit is too large (maximum 1000)',
        UserInputErrorCodes.PARAM_OUT_OF_RANGE,
        { limit: args.limit },
        ['Try a smaller value (e.g., 100)', 'Large limits may cause slow performance']
      );
    }

    const { primaryCategory, subcategory } = await this.parseCategory(args.category);

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
    const { primaryCategory, subcategory } = await this.parseCategory(args.category);

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
    const { primaryCategory, subcategory } = await this.parseCategory(args.category);

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
    const startTime = Date.now();
    const { primaryCategory, subcategory } = await this.parseCategory(args.category);

    // Get daily data first
    const dailyData = await this.callStoredProcedure('query_metrics', {
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

    // Check for empty results
    if (!dailyData.rows || dailyData.rows.length === 0) {
      const categoryDesc = primaryCategory || subcategory ? ` for ${primaryCategory || subcategory}` : '';
      throw new UserInputError(
        `No sales data found${categoryDesc} for the period ${args.startDate} to ${args.endDate}`,
        UserInputErrorCodes.NO_DATA_FOUND,
        { startDate: args.startDate, endDate: args.endDate, category: args.category },
        ['Try a different date range with available data', 'Check if data has been loaded for this period', 'Try removing category filters']
      );
    }

    // Aggregate by day type
    const aggregated = this.aggregateByDayType(dailyData.rows, args.comparison);

    return {
      rows: aggregated,
      totalRows: aggregated.length,
      executionTimeMs: Date.now() - startTime
    };
  }

  /**
   * Aggregate daily data by day type (weekday vs weekend)
   */
  private aggregateByDayType(dailyRows: any[], comparison: string): any[] {
    const weekdayTotal = { total: 0, days: 0, dayType: 'Weekday' };
    const weekendTotal = { total: 0, days: 0, dayType: 'Weekend' };

    for (const row of dailyRows) {
      const date = new Date(row.report_date || row.date);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      const value = parseFloat(row.metric_value || row.total || 0);

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // Weekend (Saturday or Sunday)
        weekendTotal.total += value;
        weekendTotal.days++;
      } else {
        // Weekday (Monday-Friday)
        weekdayTotal.total += value;
        weekdayTotal.days++;
      }
    }

    // Calculate averages
    const weekdayAvg = weekdayTotal.days > 0 ? weekdayTotal.total / weekdayTotal.days : 0;
    const weekendAvg = weekendTotal.days > 0 ? weekendTotal.total / weekendTotal.days : 0;

    return [
      {
        day_type: 'Weekday',
        total_sales: weekdayTotal.total.toFixed(2),
        average_sales: weekdayAvg.toFixed(2),
        num_days: weekdayTotal.days
      },
      {
        day_type: 'Weekend',
        total_sales: weekendTotal.total.toFixed(2),
        average_sales: weekendAvg.toFixed(2),
        num_days: weekendTotal.days
      }
    ];
  }

  /**
   * Track item performance
   */
  private async trackItemPerformance(args: {
    itemName: string;
    startDate: string;
    endDate: string;
  }): Promise<ToolResult> {
    try {
      // Try exact match first
      const result = await this.callStoredProcedure('query_metrics', {
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

      // If we got results, return them
      if (result.rows && result.rows.length > 0) {
        return result;
      }

      // No results - try to find similar item names
      const suggestions = await this.findSimilarItemNames(args.itemName);

      if (suggestions.length > 0) {
        console.log(JSON.stringify({
          severity: 'INFO',
          message: 'Item not found but suggestions available',
          searchedFor: args.itemName,
          suggestions: suggestions
        }));

        // Return empty result with suggestion metadata
        return {
          rows: [],
          totalRows: 0,
          executionTimeMs: result.executionTimeMs,
         };
      }

      // No data and no suggestions
      return result;
    } catch (error: any) {
      console.error('Error in trackItemPerformance:', error);
      throw error;
    }
  }

  /**
   * Find similar item names using partial matching
   */
  private async findSimilarItemNames(searchTerm: string): Promise<string[]> {
    try {
      // Search for items that contain the search term (case-insensitive)
      const query = `
        SELECT DISTINCT item_name
        FROM \`${this.projectId}.${this.dataset}.metrics\`
        WHERE LOWER(item_name) LIKE LOWER(@search_pattern)
        LIMIT 5
      `;

      const [rows] = await this.bqClient.query({
        query,
        params: {
          search_pattern: `%${searchTerm}%`
        },
        location: 'us-central1',
        jobTimeoutMs: 5000
      });

      return rows.map((row: any) => row.item_name);
    } catch (error: any) {
      console.warn('Failed to find similar item names:', error.message);
      return [];
    }
  }

  /**
   * Compare two time periods (optionally for a specific item)
   */
  private async comparePeriods(args: {
    startDate1: string;
    endDate1: string;
    startDate2: string;
    endDate2: string;
    category?: string;
    itemName?: string;
  }): Promise<ToolResult> {
    const { primaryCategory, subcategory } = await this.parseCategory(args.category);

    return this.callStoredProcedure('query_metrics', {
      metric_name: 'net_sales',
      start_date: args.startDate1,
      end_date: args.endDate1,
      primary_category: primaryCategory,
      subcategory: subcategory,
      item_name: args.itemName || null,
      aggregation: 'SUM',
      group_by_fields: null,
      baseline_start_date: args.startDate2,
      baseline_end_date: args.endDate2,
      max_rows: 1,
      order_by_field: 'metric_value',
      order_direction: 'DESC'
    });
  }

  /**
   * Get latest available date in the dataset (with caching)
   */
  async getLatestAvailableDate(): Promise<string | null> {
    if (this.latestDateCache) {
      return this.latestDateCache;
    }

    try {
      const query = `
        SELECT MAX(report_date) as latest_date
        FROM \`${this.projectId}.${this.dataset}.reports\`
        WHERE customer_id = @customer_id
      `;

      const [rows] = await this.bqClient.query({
        query,
        params: { customer_id: this.customerId },
        location: 'us-central1',
        jobTimeoutMs: 5000
      });

      if (rows && rows.length > 0 && rows[0].latest_date) {
        this.latestDateCache = this.formatBigQueryDate(rows[0].latest_date);

        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Latest available date cached',
          date: this.latestDateCache
        }));

        return this.latestDateCache;
      }

      return null;
    } catch (error: any) {
      console.warn('Failed to fetch latest available date:', error.message);
      return null;
    }
  }

  /**
   * Get first available date in the dataset (with caching)
   */
  async getFirstAvailableDate(): Promise<string | null> {
    if (this.firstDateCache) {
      return this.firstDateCache;
    }

    try {
      const query = `
        SELECT MIN(report_date) as first_date
        FROM \`${this.projectId}.${this.dataset}.reports\`
        WHERE customer_id = @customer_id
      `;

      const [rows] = await this.bqClient.query({
        query,
        params: { customer_id: this.customerId },
        location: 'us-central1',
        jobTimeoutMs: 5000
      });

      if (rows && rows.length > 0 && rows[0].first_date) {
        this.firstDateCache = this.formatBigQueryDate(rows[0].first_date);

        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'First available date cached',
          date: this.firstDateCache
        }));

        return this.firstDateCache;
      }

      return null;
    } catch (error: any) {
      console.warn('Failed to fetch first available date:', error.message);
      return null;
    }
  }

  /**
   * Format BigQuery date object to YYYY-MM-DD string
   */
  private formatBigQueryDate(dateValue: any): string {
    if (typeof dateValue === 'string') {
      // Already formatted or ISO string
      return dateValue.split('T')[0];
    }

    if (dateValue && dateValue.value) {
      // BigQuery Date object
      return dateValue.value;
    }

    // Fallback: try to parse as date
    const date = new Date(dateValue);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Get list of primary categories from BigQuery (with caching)
   */
  private async getPrimaryCategories(): Promise<string[]> {
    if (this.primaryCategoriesCache) {
      return this.primaryCategoriesCache;
    }

    try {
      const query = `
        SELECT DISTINCT primary_category
        FROM \`${this.projectId}.${this.dataset}.metrics\`
        WHERE primary_category LIKE '(%'
        ORDER BY primary_category
      `;

      const [rows] = await this.bqClient.query({
        query,
        location: 'us-central1',
        jobTimeoutMs: 5000
      });

      this.primaryCategoriesCache = rows.map((row: any) => row.primary_category);

      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Primary categories cached',
        count: this.primaryCategoriesCache.length
      }));

      return this.primaryCategoriesCache;
    } catch (error: any) {
      console.warn('Failed to fetch primary categories, using empty list:', error.message);
      return [];
    }
  }

  /**
   * Parse category string into primary/sub category
   * Categories in parentheses like "(Beer)" are primary categories
   * Others like "Bottle Beer" are subcategories
   * Smart matching: "Sushi" → "(Sushi)" if it matches a known primary category
   */
  private async parseCategory(category?: string): Promise<{ primaryCategory: string | null; subcategory: string | null }> {
    if (!category) {
      return { primaryCategory: null, subcategory: null };
    }

    // Check if it's a primary category (in parentheses)
    if (category.startsWith('(') && category.endsWith(')')) {
      return { primaryCategory: category, subcategory: null };
    }

    // Smart matching: check if input matches a known primary category
    const primaryCategories = await this.getPrimaryCategories();
    const normalizedInput = category.toLowerCase().trim();

    for (const primaryCat of primaryCategories) {
      // Remove parentheses for comparison: "(Sushi)" → "sushi"
      const normalizedPrimary = primaryCat.replace(/[()]/g, '').toLowerCase().trim();

      if (normalizedInput === normalizedPrimary) {
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Smart category match',
          input: category,
          matched: primaryCat
        }));
        return { primaryCategory: primaryCat, subcategory: null };
      }
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
      const errorMessage = error.message || '';

      // Detect timeout errors
      if (errorMessage.includes('timeout') || errorMessage.includes('deadline exceeded')) {
        throw new TransientError(
          'Query took too long to execute. Try narrowing your date range or filters.',
          TransientErrorCodes.NETWORK_TIMEOUT,
          {
            procedureName,
            params,
            executionTimeMs: Date.now() - startTime
          },
          5000 // Suggest retrying after 5 seconds
        );
      }

      // Detect not found errors (invalid category, etc.)
      if (errorMessage.includes('not found') || errorMessage.includes('does not exist')) {
        throw new UserInputError(
          'The requested data was not found. Please check your filters.',
          UserInputErrorCodes.INVALID_CATEGORY,
          {
            procedureName,
            params
          },
          ['Check category spelling (e.g., "(Beer)", "(Sushi)")', 'Try broadening your date range', 'Verify item names are correct']
        );
      }

      // Detect rate limit errors
      if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
        throw new TransientError(
          'BigQuery rate limit exceeded. Please try again in a moment.',
          TransientErrorCodes.RATE_LIMIT_EXCEEDED,
          {
            procedureName,
            executionTimeMs: Date.now() - startTime
          },
          10000 // Suggest retrying after 10 seconds
        );
      }

      // Generic BigQuery error
      console.error('BigQuery error:', error);
      throw new TransientError(
        'Database query failed. Please try again.',
        TransientErrorCodes.SERVICE_UNAVAILABLE,
        {
          procedureName,
          errorMessage: error.message,
          executionTimeMs: Date.now() - startTime
        }
      );
    }
  }
}
