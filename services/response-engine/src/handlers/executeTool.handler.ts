/**
 * Execute Tool Handler
 *
 * Main handler for the /execute-tool endpoint.
 * This is the core of the Tool Server architecture.
 *
 * Request format:
 * {
 *   "tool_name": "show_daily_sales",
 *   "tenant_id": "senso-sushi",
 *   "args": { "startDate": "2025-05-01", "endDate": "2025-05-31" }
 * }
 *
 * Response format:
 * {
 *   "status": "success",
 *   "data": [...],
 *   "chartUrl": "https://...",
 *   "metadata": { "tool_name": "...", "row_count": 10, ... }
 * }
 */

import { Request, Response } from 'express';
import { AnalyticsToolHandler } from '../tools/AnalyticsToolHandler';
import { ResponseFormatter, ToolResponse } from '../core/ResponseFormatter';
import { ChartBuilder } from '../chart/ChartBuilder';
import { INTENT_FUNCTIONS } from '../tools/intentFunctions';

// Valid tool names (extracted from intent functions)
const VALID_TOOL_NAMES = INTENT_FUNCTIONS.map(fn => fn.name);

/**
 * Handle /execute-tool POST request
 *
 * Validates input, executes the requested tool, and returns structured JSON
 */
export async function handleExecuteTool(req: Request, res: Response): Promise<void> {
  const startTime = Date.now();

  try {
    // Extract request body
    const { tool_name, tenant_id, args } = req.body;

    // Get authenticated email from IAM middleware
    const authenticatedEmail = (req as any).authenticatedEmail || 'unknown';

    // Validation: Check required fields
    if (!tool_name) {
      const response = ResponseFormatter.formatError(
        'Missing required field: tool_name',
        'MISSING_REQUIRED_FIELD',
        ['Provide a tool_name in the request body', `Valid tools: ${VALID_TOOL_NAMES.join(', ')}`]
      );
      res.status(400).json(response);
      return;
    }

    if (!tenant_id) {
      const response = ResponseFormatter.formatError(
        'Missing required field: tenant_id',
        'MISSING_REQUIRED_FIELD',
        ['Provide a tenant_id in the request body', 'Example: "senso-sushi"']
      );
      res.status(400).json(response);
      return;
    }

    if (!args || typeof args !== 'object') {
      const response = ResponseFormatter.formatError(
        'Missing or invalid field: args',
        'INVALID_ARGS',
        ['Provide an args object with function parameters', 'Example: {"startDate": "2025-05-01", "endDate": "2025-05-31"}']
      );
      res.status(400).json(response);
      return;
    }

    // Validation: Check tool_name is valid
    if (!VALID_TOOL_NAMES.includes(tool_name)) {
      const response = ResponseFormatter.formatError(
        `Unknown tool: ${tool_name}`,
        'INVALID_TOOL_NAME',
        [
          `Valid tools: ${VALID_TOOL_NAMES.join(', ')}`,
          'Check the tool name spelling',
          'Refer to the intent functions documentation'
        ]
      );
      res.status(400).json(response);
      return;
    }

    // Log incoming request
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Execute tool request received',
      tool_name,
      tenant_id,
      args,
      authenticated_email: authenticatedEmail,
      request_id: req.headers['x-cloud-trace-context'] || 'unknown'
    }));

    // Execute the tool via AnalyticsToolHandler
    const toolResult = await AnalyticsToolHandler.execute(tenant_id, tool_name, args);

    // Generate chart if applicable and data is available
    let chartUrl: string | null = null;
    if (toolResult.rows.length > 0 && shouldGenerateChart(tool_name)) {
      try {
        const chartBuilder = new ChartBuilder();
        chartUrl = await chartBuilder.buildChart(toolResult.rows, tool_name);
      } catch (chartError: any) {
        // Chart generation is non-critical, log and continue
        console.warn(JSON.stringify({
          severity: 'WARNING',
          message: 'Chart generation failed (non-critical)',
          error: chartError.message,
          tool_name
        }));
      }
    }

    // Format response using ResponseFormatter
    const executionTimeMs = Date.now() - startTime;
    const response: ToolResponse = ResponseFormatter.formatToolResponse(
      toolResult.rows,
      tool_name,
      chartUrl,
      executionTimeMs,
      tenant_id
    );

    // Log successful execution
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Tool executed successfully',
      tool_name,
      tenant_id,
      row_count: toolResult.rows.length,
      chart_generated: chartUrl !== null,
      execution_time_ms: executionTimeMs,
      authenticated_email: authenticatedEmail
    }));

    // Return JSON response
    res.status(200).json(response);

  } catch (error: any) {
    const executionTimeMs = Date.now() - startTime;

    // Log error
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Tool execution failed',
      error: error.message,
      stack: error.stack,
      tool_name: req.body?.tool_name,
      tenant_id: req.body?.tenant_id,
      execution_time_ms: executionTimeMs
    }));

    // Format error response
    const response = ResponseFormatter.formatError(
      error.message || 'Tool execution failed',
      error.code || 'EXECUTION_ERROR',
      error.suggestions || ['Check the tool arguments', 'Verify the tenant has data for this period', 'Try again in a moment']
    );

    // Return error response (500 for unexpected errors)
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json(response);
  }
}

/**
 * Determine if chart should be generated for this tool
 *
 * Charts are useful for time-series and comparative data
 */
function shouldGenerateChart(toolName: string): boolean {
  const chartableTools = [
    'show_daily_sales',
    'track_item_performance',
    'compare_periods',
    'show_category_breakdown',
    'compare_day_types'
  ];

  return chartableTools.includes(toolName);
}
