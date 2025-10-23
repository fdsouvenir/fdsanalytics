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

      // Step 2: Build system instruction and conversation history
      const systemInstruction = this.buildSystemInstruction(input);
      const conversationHistory = this.buildConversationHistory(input.context);

      // Step 3: Ask Gemini which tool(s) to call using chat API
      const geminiResponse = await this.geminiClient.generateChatResponse({
        userMessage: input.userMessage,
        systemInstruction: systemInstruction,
        conversationHistory: conversationHistory,
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
   * Build system instruction for Gemini (persistent context)
   */
  private buildSystemInstruction(input: ResponseGeneratorInput): string {
    const parts: string[] = [];

    // Business context
    parts.push(`You are an analytics assistant for ${input.tenantConfig.businessName}.`);
    parts.push(`Business timezone: ${input.tenantConfig.timezone}`);
    parts.push(`Currency: ${input.tenantConfig.currency}`);
    parts.push(`Current date and time: ${input.currentDateTime.toISOString()}`);

    // Available categories
    if (input.availableCategories && input.availableCategories.length > 0) {
      parts.push(`\nAvailable product categories: ${input.availableCategories.join(', ')}`);
    }

    // Context retention instructions
    parts.push(`\nContext Retention:`);
    parts.push(`- Read conversation history to understand context`);
    parts.push(`- If current message refers to previous timeframes, categories, or metrics, use that information`);
    parts.push(`- If user says "totals" after asking about a timeframe, use that timeframe`);
    parts.push(`- If user says "compare to X" after asking about Y, apply same parameters to both`);
    parts.push(`- Only ask for clarification if context is truly missing or ambiguous`);

    // Ordering and ranking instructions
    parts.push(`\nExtracting Ordering and Ranking:`);
    parts.push(`- "top N", "highest", "best", "most" → orderBy.direction="desc", limit=N`);
    parts.push(`- "bottom N", "lowest", "least", "worst" → orderBy.direction="asc", limit=N`);
    parts.push(`- "day with highest/lowest" → groupBy=["date"], orderBy accordingly, limit=1`);
    parts.push(`- orderBy.field should typically be "metric_value"`);
    parts.push(`- Examples:`);
    parts.push(`  * "Top 5 items" → orderBy: {field: "metric_value", direction: "desc"}, limit: 5, groupBy: ["item"]`);
    parts.push(`  * "Highest sales day" → orderBy: {field: "metric_value", direction: "desc"}, limit: 1, groupBy: ["date"]`);
    parts.push(`  * "Show by category" → groupBy: ["category"], orderBy: {field: "metric_value", direction: "desc"}`);

    return parts.join('\n');
  }

  /**
   * Build conversation history array from context
   */
  private buildConversationHistory(context: ConversationContext): Array<{
    role: 'user' | 'model';
    content: string;
  }> {
    if (!context || !context.relevantMessages || context.relevantMessages.length === 0) {
      return [];
    }

    // Convert last 6 messages to Gemini format
    return context.relevantMessages
      .slice(-6)
      .map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        content: msg.content
      }));
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