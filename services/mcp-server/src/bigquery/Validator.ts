// Parameter Validator
// Validates parameters against live BigQuery data

import { BigQueryClient } from './BigQueryClient';
import { config } from '../config/config';
import { TimeframeSchema, QueryAnalyticsParams } from '../schemas/paramSchemas';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestions?: string[];
}

export class Validator {
  private bqClient: BigQueryClient;
  private cachedCategories: string[] | null = null;
  private cachedSubcategories: string[] | null = null;
  private cacheTimestamp: number = 0;
  private cacheTtlMs = 3600000; // 1 hour

  constructor(bqClient: BigQueryClient) {
    this.bqClient = bqClient;
  }

  /**
   * Validate a primary category exists in the data
   */
  async validateCategory(category: string | undefined): Promise<ValidationResult> {
    if (!category) {
      return { valid: true }; // Optional parameter
    }

    // Refresh cache if needed
    if (!this.cachedCategories || Date.now() - this.cacheTimestamp > this.cacheTtlMs) {
      await this.refreshCategoryCache();
    }

    const normalizedInput = category.trim();
    const found = this.cachedCategories!.includes(normalizedInput);

    if (!found) {
      // Find close matches
      const suggestions = this.cachedCategories!.filter(cat =>
        cat.toLowerCase().includes(normalizedInput.toLowerCase()) ||
        normalizedInput.toLowerCase().includes(cat.toLowerCase())
      ).slice(0, 5);

      return {
        valid: false,
        error: `Category '${category}' not found in data`,
        suggestions: suggestions.length > 0 ? suggestions : this.cachedCategories!.slice(0, 5)
      };
    }

    return { valid: true };
  }

  /**
   * Validate a subcategory exists in the data
   */
  async validateSubcategory(subcategory: string | undefined): Promise<ValidationResult> {
    if (!subcategory) {
      return { valid: true }; // Optional parameter
    }

    // Refresh cache if needed
    if (!this.cachedSubcategories || Date.now() - this.cacheTimestamp > this.cacheTtlMs) {
      await this.refreshCategoryCache();
    }

    const normalizedInput = subcategory.trim();
    const found = this.cachedSubcategories!.includes(normalizedInput);

    if (!found) {
      const suggestions = this.cachedSubcategories!.filter(sub =>
        sub.toLowerCase().includes(normalizedInput.toLowerCase())
      ).slice(0, 5);

      return {
        valid: false,
        error: `Subcategory '${subcategory}' not found in data`,
        suggestions: suggestions.length > 0 ? suggestions : this.cachedSubcategories!.slice(0, 10)
      };
    }

    return { valid: true };
  }

  /**
   * Validate timeframe parameters
   */
  validateTimeframe(timeframe: any): ValidationResult {
    try {
      TimeframeSchema.parse(timeframe);

      // Additional validation for absolute dates
      if (timeframe.type === 'absolute') {
        if (!timeframe.start || !timeframe.end) {
          return {
            valid: false,
            error: 'Absolute timeframe requires both start and end dates'
          };
        }

        const start = new Date(timeframe.start);
        const end = new Date(timeframe.end);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          return {
            valid: false,
            error: 'Invalid date format. Use YYYY-MM-DD'
          };
        }

        if (start > end) {
          return {
            valid: false,
            error: 'Start date must be before or equal to end date'
          };
        }

        // Check if dates are in reasonable range (not too far in future)
        const now = new Date();
        if (start > now || end > now) {
          return {
            valid: false,
            error: 'Dates cannot be in the future'
          };
        }
      } else if (timeframe.type === 'relative') {
        if (!timeframe.relative) {
          return {
            valid: false,
            error: 'Relative timeframe requires a relative value (e.g., "today", "last_week")'
          };
        }
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: `Invalid timeframe: ${error.message}`
      };
    }
  }

  /**
   * Validate all parameters for query_analytics
   */
  async validateQueryAnalytics(params: QueryAnalyticsParams): Promise<ValidationResult> {
    // Validate timeframe
    const timeframeResult = this.validateTimeframe(params.timeframe);
    if (!timeframeResult.valid) {
      return timeframeResult;
    }

    // Validate comparison timeframe if provided
    if (params.comparison?.baselineTimeframe) {
      const comparisonResult = this.validateTimeframe(params.comparison.baselineTimeframe);
      if (!comparisonResult.valid) {
        return {
          valid: false,
          error: `Baseline ${comparisonResult.error}`
        };
      }
    }

    // Validate category filter if provided
    if (params.filters?.primaryCategory) {
      const categoryResult = await this.validateCategory(params.filters.primaryCategory);
      if (!categoryResult.valid) {
        return categoryResult;
      }
    }

    // Validate subcategory filter if provided
    if (params.filters?.subcategory) {
      const subcategoryResult = await this.validateSubcategory(params.filters.subcategory);
      if (!subcategoryResult.valid) {
        return subcategoryResult;
      }
    }

    return { valid: true };
  }

  /**
   * Refresh category cache from BigQuery
   */
  private async refreshCategoryCache(): Promise<void> {
    try {
      // Get distinct primary categories
      const categoriesQuery = `
        SELECT DISTINCT primary_category
        FROM \`${config.projectId}.${config.bqDatasetAnalytics}.metrics\`
        WHERE primary_category IS NOT NULL
        ORDER BY primary_category
      `;

      const categoriesResult = await this.bqClient.query(categoriesQuery);
      this.cachedCategories = categoriesResult.rows.map((row: any) => row.primary_category);

      // Get distinct subcategories
      const subcategoriesQuery = `
        SELECT DISTINCT JSON_EXTRACT_SCALAR(dimensions, '$.category') as subcategory
        FROM \`${config.projectId}.${config.bqDatasetAnalytics}.metrics\`
        WHERE JSON_EXTRACT_SCALAR(dimensions, '$.category') IS NOT NULL
        ORDER BY subcategory
      `;

      const subcategoriesResult = await this.bqClient.query(subcategoriesQuery);
      this.cachedSubcategories = subcategoriesResult.rows
        .map((row: any) => row.subcategory)
        .filter((sub: string) => sub !== null);

      this.cacheTimestamp = Date.now();
    } catch (error: any) {
      throw new Error(`Failed to refresh category cache: ${error.message}`);
    }
  }

  /**
   * Get available categories (for client use)
   */
  async getAvailableCategories(): Promise<string[]> {
    if (!this.cachedCategories || Date.now() - this.cacheTimestamp > this.cacheTtlMs) {
      await this.refreshCategoryCache();
    }
    return this.cachedCategories || [];
  }

  /**
   * Get available subcategories (for client use)
   */
  async getAvailableSubcategories(): Promise<string[]> {
    if (!this.cachedSubcategories || Date.now() - this.cacheTimestamp > this.cacheTtlMs) {
      await this.refreshCategoryCache();
    }
    return this.cachedSubcategories || [];
  }
}
