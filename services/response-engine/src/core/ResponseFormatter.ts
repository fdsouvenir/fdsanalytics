/**
 * ResponseFormatter - Format tool results for Vertex AI Agent consumption
 *
 * Returns structured JSON data that Vertex AI Agent Builder can use for:
 * - Natural Language Generation (NLG) - converting data to user-friendly text
 * - Including chart URLs in responses
 * - Providing metadata about the tool execution
 *
 * This formatter returns raw data, NOT presentation/UI elements.
 * Vertex AI Agent is responsible for generating the final user-facing response.
 */

export interface ToolResponse {
  status: 'success' | 'error';
  data: any[];
  chartUrl?: string | null;
  metadata: {
    tool_name: string;
    row_count: number;
    execution_time_ms?: number;
    tenant_id?: string;
  };
  error?: {
    message: string;
    code?: string;
    suggestions?: string[];
  };
}

export class ResponseFormatter {
  /**
   * Format tool execution result into structured JSON
   *
   * @param data - Raw rows from BigQuery
   * @param toolName - Name of the intent function executed
   * @param chartUrl - Optional chart URL from ChartBuilder
   * @param executionTimeMs - Optional execution time
   * @param tenantId - Optional tenant identifier
   * @returns Structured ToolResponse for Vertex AI
   */
  static formatToolResponse(
    data: any[],
    toolName: string,
    chartUrl?: string | null,
    executionTimeMs?: number,
    tenantId?: string
  ): ToolResponse {
    return {
      status: 'success',
      data,
      chartUrl: chartUrl || null,
      metadata: {
        tool_name: toolName,
        row_count: data.length,
        execution_time_ms: executionTimeMs,
        tenant_id: tenantId
      }
    };
  }

  /**
   * Format error response
   *
   * @param error - Error object or message
   * @param code - Optional error code
   * @param suggestions - Optional suggestions for the user
   * @returns Structured error response
   */
  static formatError(
    error: string | Error,
    code?: string,
    suggestions?: string[]
  ): ToolResponse {
    const errorMessage = typeof error === 'string' ? error : error.message;

    return {
      status: 'error',
      data: [],
      metadata: {
        tool_name: 'unknown',
        row_count: 0
      },
      error: {
        message: errorMessage,
        code,
        suggestions
      }
    };
  }

  /**
   * Format "no data found" response
   *
   * @param toolName - Name of the tool that returned no data
   * @param query - Query parameters for context
   * @returns Structured response indicating no data
   */
  static formatNoData(toolName: string, query: Record<string, any>): ToolResponse {
    return {
      status: 'success',
      data: [],
      metadata: {
        tool_name: toolName,
        row_count: 0
      },
      error: {
        message: 'No data found for the specified query',
        code: 'NO_DATA_FOUND',
        suggestions: [
          'Try a different date range',
          'Check if data has been loaded for this period',
          'Try removing category or item filters'
        ]
      }
    };
  }

  // ============================================================================
  // Utility methods for data formatting (kept for backward compatibility)
  // ============================================================================

  /**
   * Format currency value
   * Kept for potential use in data transformation
   */
  static formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency
    }).format(value);
  }

  /**
   * Format percentage
   * Kept for potential use in data transformation
   */
  static formatPercentage(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }

  /**
   * Add trend indicator
   * Kept for potential use in data transformation
   */
  static addTrendIndicator(value: number): string {
    if (value > 0) {
      return '↑';
    } else if (value < 0) {
      return '↓';
    }
    return '→';
  }
}
