import { MCPClient } from '../clients/MCPClient';
import { GeminiClient } from '../clients/GeminiClient';
import { ChartBuilder, ChartSpec } from '../chart/ChartBuilder';
import { TenantConfig } from '../config/tenantConfig';

interface ConversationContext {
  relevantMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  summary?: string;
  entitiesExtracted?: {
    categories?: string[];
    dateRanges?: string[];
    metrics?: string[];
  };
}

export interface ResponseGeneratorInput {
  userMessage: string;
  context: ConversationContext;
  tenantConfig: TenantConfig;
  currentDateTime: Date;
  availableCategories: string[];
}

export interface ResponseGeneratorOutput {
  responseText: string;
  chartUrl: string | null;
  chartTitle?: string;
  toolCallsMade: ToolCall[];
}

interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  result: any;
  durationMs: number;
}

/**
 * ResponseGenerator - Core orchestration logic
 *
 * Handles:
 * - Using Gemini Pro to determine which MCP tools to call
 * - Calling MCP tools with appropriate parameters
 * - Generating conversational responses
 * - Creating charts when appropriate
 */
export class ResponseGenerator {
  private chartBuilder: ChartBuilder;

  constructor(
    private mcpClient: MCPClient,
    private geminiClient: GeminiClient,
    private enableCharts: boolean = true
  ) {
    this.chartBuilder = new ChartBuilder();
  }

  /**
   * Generate response from user message
   */
  async generate(input: ResponseGeneratorInput): Promise<ResponseGeneratorOutput> {
    const toolCalls: ToolCall[] = [];
    let responseText = '';
    let chartUrl: string | null = null;
    let chartTitle: string | undefined;

    try {
      // Step 1: Get MCP tool definitions
      const availableTools = await this.getMCPToolDefinitions();

      // Step 2: Build context for Gemini
      const contextStr = this.buildContext(input);

      // Step 3: Ask Gemini which tool(s) to call
      const geminiResponse = await this.geminiClient.generateResponse({
        userMessage: input.userMessage,
        context: contextStr,
        availableFunctions: availableTools
      });

      // Step 4: Execute tool call if Gemini requested one
      if (geminiResponse.functionCall) {
        const toolStartTime = Date.now();
        const toolResult = await this.mcpClient.callTool(
          geminiResponse.functionCall.name,
          geminiResponse.functionCall.args
        );
        const toolDuration = Date.now() - toolStartTime;

        toolCalls.push({
          toolName: geminiResponse.functionCall.name,
          parameters: geminiResponse.functionCall.args,
          result: toolResult,
          durationMs: toolDuration
        });

        // Step 5: Send tool result back to Gemini for final response
        responseText = await this.geminiClient.generateFinalResponse(
          input.userMessage,
          geminiResponse.functionCall.name,
          toolResult
        );

        // Step 6: Generate chart if appropriate
        if (this.enableCharts && this.shouldGenerateChart(toolResult)) {
          const chartSpec = this.buildChartSpec(toolResult, geminiResponse.functionCall.name);
          if (chartSpec) {
            chartUrl = await this.chartBuilder.generateChartUrl(chartSpec);
            chartTitle = chartSpec.title;
          }
        }
      } else {
        // No function call - use Gemini's direct response
        responseText = geminiResponse.text || 'I\'m not sure how to help with that.';
      }
    } catch (error: any) {
      console.error('Error generating response', {
        error: error.message,
        userMessage: input.userMessage
      });

      responseText = this.formatErrorResponse(error);
    }

    return {
      responseText,
      chartUrl,
      chartTitle,
      toolCallsMade: toolCalls
    };
  }

  /**
   * Get MCP tool definitions for Gemini function calling
   */
  private async getMCPToolDefinitions(): Promise<Array<{
    name: string;
    description: string;
    parameters: any;
  }>> {
    const tools = await this.mcpClient.listTools();

    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }));
  }

  /**
   * Build context string for Gemini
   */
  private buildContext(input: ResponseGeneratorInput): string {
    const parts: string[] = [];

    // CONVERSATION HISTORY FIRST - Make it prominent for context retention
    if (input.context && input.context.relevantMessages && input.context.relevantMessages.length > 0) {
      parts.push(`=== CONVERSATION HISTORY ===`);
      const messages = input.context.relevantMessages.slice(-6); // Last 6 messages
      messages.forEach(msg => {
        parts.push(`${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`);
      });
      parts.push(`User: ${input.userMessage}`);
      parts.push(`=== END CONVERSATION ===\n`);
    }

    // Add context instruction
    parts.push(`Instructions: Read the conversation history above to understand context. If the current message refers to previous context (like timeframes, categories, or items), use that information to complete the query. If context is unclear, ask for clarification.\n`);

    // Add tenant info
    parts.push(`Business: ${input.tenantConfig.businessName}`);
    parts.push(`Timezone: ${input.tenantConfig.timezone}`);
    parts.push(`Currency: ${input.tenantConfig.currency}`);

    // Add current date/time
    parts.push(`Current date: ${input.currentDateTime.toISOString()}`);

    // Add available categories
    if (input.availableCategories && input.availableCategories.length > 0) {
      parts.push(`Available categories: ${input.availableCategories.join(', ')}`);
    }

    // Add ordering instructions for Gemini
    parts.push(`\nIMPORTANT - Extracting ordering and ranking from queries:`);
    parts.push(`- When user asks for "top N", "highest", "best", "most": Set orderBy.direction to "desc" and limit to N`);
    parts.push(`- When user asks for "bottom N", "lowest", "least", "worst": Set orderBy.direction to "asc" and limit to N`);
    parts.push(`- When user asks for "day with highest/lowest": Set groupBy to ["date"], orderBy accordingly, and limit to 1`);
    parts.push(`- Always set orderBy.field to "metric_value" when ordering by the metric being queried`);
    parts.push(`- Examples:`);
    parts.push(`  * "Top 5 items" → orderBy: {field: "metric_value", direction: "desc"}, limit: 5, groupBy: ["item"]`);
    parts.push(`  * "Highest sales day" → orderBy: {field: "metric_value", direction: "desc"}, limit: 1, groupBy: ["date"]`);
    parts.push(`  * "Show by category" → groupBy: ["category"], orderBy: {field: "metric_value", direction: "desc"}`);

    return parts.join('\n');
  }

  /**
   * Determine if we should generate a chart based on tool result
   */
  private shouldGenerateChart(toolResult: any): boolean {
    if (!toolResult || !toolResult.rows) {
      return false;
    }

    // Only generate charts for queries with 2-20 data points
    const rowCount = toolResult.rows.length;
    return rowCount >= 2 && rowCount <= 20;
  }

  /**
   * Build chart spec from tool result
   */
  private buildChartSpec(toolResult: any, toolName: string): ChartSpec | null {
    if (!toolResult.rows || toolResult.rows.length === 0) {
      return null;
    }

    try {
      // Extract labels and values from rows
      const rows = toolResult.rows;
      const firstRow = rows[0];

      // Determine label and value fields
      let labelField: string | null = null;
      let valueField: string | null = null;

      // Common patterns
      if ('primary_category' in firstRow) {
        labelField = 'primary_category';
      } else if ('subcategory' in firstRow) {
        labelField = 'subcategory';
      } else if ('report_date' in firstRow) {
        labelField = 'report_date';
      } else if ('item_name' in firstRow) {
        labelField = 'item_name';
      }

      if ('total' in firstRow) {
        valueField = 'total';
      } else if ('net_sales' in firstRow) {
        valueField = 'net_sales';
      } else if ('quantity_sold' in firstRow) {
        valueField = 'quantity_sold';
      }

      if (!labelField || !valueField) {
        return null;
      }

      const labels = rows.map((row: any) => String(row[labelField!]));
      const values = rows.map((row: any) => parseFloat(row[valueField!]) || 0);

      // Determine chart type based on tool and data
      let chartType: 'bar' | 'line' = 'bar';
      if (labelField === 'report_date') {
        chartType = 'line'; // Use line chart for date-based data
      }

      return {
        type: chartType,
        title: this.generateChartTitle(toolName, labelField, valueField),
        data: {
          labels,
          datasets: [
            {
              label: valueField.replace(/_/g, ' '),
              data: values
            }
          ]
        }
      };
    } catch (error: any) {
      console.error('Failed to build chart spec', {
        error: error.message,
        toolName
      });
      return null;
    }
  }

  /**
   * Generate chart title
   */
  private generateChartTitle(toolName: string, labelField: string, valueField: string): string {
    const valueLabel = valueField.replace(/_/g, ' ');
    const groupLabel = labelField.replace(/_/g, ' ');

    return `${valueLabel} by ${groupLabel}`;
  }

  /**
   * Format error response for user
   */
  private formatErrorResponse(error: any): string {
    if (error.message?.includes('Invalid primary_category')) {
      return 'I couldn\'t find that category. Please check the spelling or ask me to list available categories.';
    }

    if (error.message?.includes('timeout')) {
      return 'That query took too long. Try narrowing your date range or category.';
    }

    if (error.message?.includes('MCP Server unavailable')) {
      return 'I\'m having trouble accessing the data right now. Please try again in a moment.';
    }

    return 'Something went wrong while processing your request. Please try again.';
  }
}