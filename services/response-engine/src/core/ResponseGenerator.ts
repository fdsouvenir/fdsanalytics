import { MCPClient } from '../clients/MCPClient';
import { GeminiClient } from '../clients/GeminiClient';
import { ChartBuilder } from '../chart/ChartBuilder';
import { ChartTypeSelector } from '../chart/ChartTypeSelector';
import { ChartSpec, ChartType } from '../chart/chartTypes';
import { TenantConfig } from '../config/tenantConfig';
import { formatChartLabel } from '../utils/labelFormatter';
import { INTENT_FUNCTIONS } from '../tools/intentFunctions';
import { AnalyticsToolHandler } from '../tools/AnalyticsToolHandler';

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
  private chartTypeSelector: ChartTypeSelector;
  private analyticsToolHandler: AnalyticsToolHandler;

  constructor(
    private mcpClient: MCPClient,
    private geminiClient: GeminiClient,
    private enableCharts: boolean = true,
    private maxChartDatapoints: number = 100
  ) {
    this.chartBuilder = new ChartBuilder();
    this.chartTypeSelector = new ChartTypeSelector(geminiClient);
    this.analyticsToolHandler = new AnalyticsToolHandler();
  }

  /**
   * Generate response from user message
   */
  async generate(input: ResponseGeneratorInput): Promise<ResponseGeneratorOutput> {
    const startTime = Date.now();
    const timings: Record<string, number> = {};
    const toolCalls: ToolCall[] = [];
    let responseText = '';
    let chartUrl: string | null = null;
    let chartTitle: string | undefined;

    try {
      // Step 1: Build system instruction and conversation history
      const step1Start = Date.now();
      const systemInstruction = this.buildSystemInstruction(input);
      const conversationHistory = this.buildConversationHistory(input.context);
      timings.buildContext = Date.now() - step1Start;

      // DEBUG: Check conversation context and history
      console.log('DEBUG: Conversation context check:', JSON.stringify({
        hasContext: !!input.context,
        hasRelevantMessages: !!(input.context?.relevantMessages),
        messageCount: input.context?.relevantMessages?.length || 0,
        messages: input.context?.relevantMessages || [],
        currentMessage: input.userMessage
      }, null, 2));

      console.log('DEBUG: Converted history for Gemini:', JSON.stringify({
        historyLength: conversationHistory.length,
        history: conversationHistory,
        systemInstructionLength: systemInstruction.length
      }, null, 2));

      // Step 2: Ask Gemini which intent function to call
      // Use gemini-2.5-flash-lite for ultra-fast tool selection (<1s vs 100s)
      // CRITICAL: Empty history for speed - matches AI Studio test setup
      const step2Start = Date.now();
      const geminiResponse = await this.geminiClient.generateChatResponse({
        userMessage: input.userMessage,
        systemInstruction: systemInstruction,
        conversationHistory: [],  // Empty history for fast tool selection
        availableFunctions: INTENT_FUNCTIONS.map(fn => ({
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters
        }))
      }, 'gemini-2.5-flash-lite');  // Use flash-lite for maximum speed
      timings.geminiToolSelection = Date.now() - step2Start;

      // Step 3: Execute intent function if Gemini requested one
      if (geminiResponse.functionCall) {
        // DEBUG: Log extracted function call details
        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Gemini extracted function call',
          functionName: geminiResponse.functionCall.name,
          extractedParameters: geminiResponse.functionCall.args,
          userMessage: input.userMessage
        }, null, 2));

        const toolStartTime = Date.now();
        const toolResult = await this.analyticsToolHandler.execute(
          geminiResponse.functionCall.name,
          geminiResponse.functionCall.args
        );
        const toolDuration = Date.now() - toolStartTime;
        timings.intentFunctionExecution = toolDuration;

        toolCalls.push({
          toolName: geminiResponse.functionCall.name,
          parameters: geminiResponse.functionCall.args,
          result: toolResult,
          durationMs: toolDuration
        });

        // Validate query result
        const resultValidation = this.validateQueryResult(toolResult, geminiResponse.functionCall.args);

        // Step 4: Send tool result back to Gemini for final response
        if (resultValidation.isEmpty) {
          responseText = this.formatEmptyResultResponse(geminiResponse.functionCall.args);
          timings.geminiFinalResponse = 0;
        } else {
          const step4Start = Date.now();
          responseText = await this.geminiClient.generateFinalResponse(
            input.userMessage,
            geminiResponse.functionCall.name,
            toolResult
            // Use default gemini-2.5-pro for high-quality final responses
          );
          timings.geminiFinalResponse = Date.now() - step4Start;

          // Add result validation warnings
          if (resultValidation.warning) {
            responseText += '\n\n' + resultValidation.warning;
          }
        }

        // Step 5: DEFER chart generation (don't block response)
        // TODO: Implement async chart generation as follow-up message
        // Chart generation takes 15s (buildChartSpec calls Gemini)
        // For now, skip to get fast text responses
        timings.buildChartSpec = 0;
        timings.generateChartUrl = 0;

        console.log(JSON.stringify({
          severity: 'DEBUG',
          message: 'Chart generation deferred for performance',
          enableCharts: this.enableCharts,
          deferredForSpeed: true
        }));
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

    // Log detailed timing breakdown
    const totalDuration = Date.now() - startTime;
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'ResponseGenerator.generate() completed',
      totalDurationMs: totalDuration,
      architecture: 'intent-based',
      models: {
        toolSelection: 'gemini-2.5-flash-lite',
        finalResponse: 'gemini-2.5-pro'
      },
      timings: {
        buildContext: timings.buildContext || 0,
        geminiToolSelection: timings.geminiToolSelection || 0,
        intentFunctionExecution: timings.intentFunctionExecution || 0,
        geminiFinalResponse: timings.geminiFinalResponse || 0,
        buildChartSpec: timings.buildChartSpec || 0,
        generateChartUrl: timings.generateChartUrl || 0
      },
      toolCallsCount: toolCalls.length,
      chartGenerated: chartUrl !== null
    }));

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
   * Minimal instruction - rely on tool schema and multi-turn chat for the rest
   */
  private buildSystemInstruction(input: ResponseGeneratorInput): string {
    return `You are an analytics assistant for ${input.tenantConfig.businessName}.
Business timezone: ${input.tenantConfig.timezone}
Currency: ${input.tenantConfig.currency}
Current date and time: ${input.currentDateTime.toISOString()}`;
  }

  /**
   * Build conversation history array from context with dynamic truncation
   */
  private buildConversationHistory(context: ConversationContext): Array<{
    role: 'user' | 'model';
    content: string;
  }> {
    if (!context || !context.relevantMessages || context.relevantMessages.length === 0) {
      return [];
    }

    const MAX_TOKENS = 8000;  // Conservative limit for Gemini context window
    let messages = context.relevantMessages;

    // Estimate tokens (rough: 1 token ≈ 4 characters)
    const estimateTokens = (msgs: typeof messages) =>
      msgs.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);

    // Truncate from oldest while over limit, but keep at least 2 most recent messages
    while (estimateTokens(messages) > MAX_TOKENS && messages.length > 2) {
      messages = messages.slice(1);  // Remove oldest
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Truncating conversation history due to token limit',
        remainingMessages: messages.length,
        estimatedTokens: estimateTokens(messages)
      }));
    }

    // If still over limit with 2 messages, truncate message content
    if (estimateTokens(messages) > MAX_TOKENS && messages.length === 2) {
      console.warn('Conversation history still over token limit with 2 messages, truncating content');
      messages = messages.map(msg => ({
        ...msg,
        content: msg.content.substring(0, MAX_TOKENS * 2)  // Rough char limit
      }));
    }

    // Ensure first message is from user (Gemini API requirement)
    while (messages.length > 0 && messages[0].role !== 'user') {
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Skipping assistant message at start of conversation history',
        skippedRole: messages[0].role
      }));
      messages = messages.slice(1);  // Skip assistant messages at start
    }

    // Convert to Gemini format
    return messages.map(msg => ({
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

    // Only generate charts for queries with sufficient data points
    const rowCount = toolResult.rows.length;
    return rowCount >= 2 && rowCount <= this.maxChartDatapoints;
  }

  /**
   * Build chart spec from tool result with intelligent type selection
   */
  private async buildChartSpec(
    toolResult: any,
    toolName: string,
    userMessage: string
  ): Promise<ChartSpec | null> {
    if (!toolResult.rows || toolResult.rows.length === 0) {
      return null;
    }

    try {
      const rows = toolResult.rows;
      const firstRow = rows[0];

      // Determine label and value fields
      let labelField: string | null = null;
      let valueField: string | null = null;

      // Common patterns (check both original and aliased column names)
      if ('primary_category' in firstRow) {
        labelField = 'primary_category';
      } else if ('category' in firstRow) {
        labelField = 'category';
      } else if ('subcategory' in firstRow) {
        labelField = 'subcategory';
      } else if ('date' in firstRow) {
        labelField = 'date';
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
      } else if ('metric_value' in firstRow) {
        valueField = 'metric_value';
      }

      if (!labelField || !valueField) {
        return null;
      }

      const labels = rows.map((row: any) => formatChartLabel(row[labelField!], labelField!));
      const values = rows.map((row: any) => parseFloat(row[valueField!]) || 0);

      // Use Gemini to intelligently select chart type
      const chartType = await this.chartTypeSelector.selectChartType(
        rows,
        toolName,
        userMessage
      );

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Chart type selected',
        chartType,
        rowCount: rows.length,
        labelField,
        valueField
      }));

      return {
        type: chartType,
        title: this.generateChartTitle(toolName, labelField, valueField, chartType),
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
  private generateChartTitle(
    toolName: string,
    labelField: string,
    valueField: string,
    chartType?: ChartType
  ): string {
    const valueLabel = valueField.replace(/_/g, ' ');
    const groupLabel = labelField.replace(/_/g, ' ');

    // Add context based on chart type
    const typeDescriptions: Record<ChartType, string> = {
      bar: 'by',
      horizontalBar: 'ranked by',
      line: 'trend over',
      area: 'cumulative',
      pie: 'distribution by',
      doughnut: 'breakdown by',
      radar: 'comparison across',
      scatter: 'correlation:',
      bubble: 'analysis:',
      polarArea: 'polar view:',
      mixed: 'comparison:'
    };

    const connector = chartType ? typeDescriptions[chartType] : 'by';
    return `${valueLabel.charAt(0).toUpperCase() + valueLabel.slice(1)} ${connector} ${groupLabel}`;
  }

  /**
   * Validate query result and provide helpful feedback
   */
  private validateQueryResult(toolResult: any, queryParams?: any): {
    isEmpty: boolean;
    warning?: string;
  } {
    const rows = toolResult?.rows || [];

    // Check if empty
    if (rows.length === 0) {
      return { isEmpty: true };
    }

    // Check if truncated
    if (rows.length >= 100) {
      return {
        isEmpty: false,
        warning: '⚠️ Showing top 100 results. Use more specific filters to narrow down your search.'
      };
    }

    // Check if very few results (might be unexpected)
    // Only warn if the query was grouped (groupBy parameter set), otherwise 1 result is expected for aggregates
    if (rows.length === 1 && queryParams?.groupBy && queryParams.groupBy.length > 0) {
      return {
        isEmpty: false,
        warning: '💡 Only one result found. You can broaden your search by expanding the date range or removing filters.'
      };
    }

    return { isEmpty: false };
  }

  /**
   * Format empty result response with helpful suggestions
   */
  private formatEmptyResultResponse(queryParams: any): string {
    const suggestions: string[] = [];

    suggestions.push('No data found for that query.');
    suggestions.push('');
    suggestions.push('Try:');

    // Suggest expanding date range
    if (queryParams.timeframe) {
      suggestions.push('• Expanding your date range');
    }

    // Suggest removing filters
    if (queryParams.filters?.primaryCategory) {
      suggestions.push('• Using a different category');
    }
    if (queryParams.filters?.subcategory) {
      suggestions.push('• Removing the subcategory filter');
    }
    if (queryParams.filters?.itemName) {
      suggestions.push('• Searching for a different item');
    }

    // Generic suggestions
    if (suggestions.length === 3) {  // Only "Try:" added
      suggestions.push('• Checking your filters');
      suggestions.push('• Using a broader search');
    }

    return suggestions.join('\n');
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