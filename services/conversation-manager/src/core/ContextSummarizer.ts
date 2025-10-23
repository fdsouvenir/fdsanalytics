/**
 * ContextSummarizer - Generates contextual summaries from conversation history
 */

import { GeminiClient, SummarizationInput } from '../gemini/GeminiClient';
import { ConversationMessage } from '../storage/BigQueryStorage';

export interface ConversationContext {
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

export class ContextSummarizer {
  constructor(private geminiClient: GeminiClient) {}

  /**
   * Summarize conversation context from message history
   */
  async summarize(
    messages: ConversationMessage[],
    currentMessage: string
  ): Promise<ConversationContext> {
    // Handle empty conversation (new thread)
    if (messages.length === 0) {
      return {
        relevantMessages: [],
        summary: 'New conversation - no previous context available.',
        entitiesExtracted: {
          categories: [],
          dateRanges: [],
          metrics: [],
        },
      };
    }

    // Convert messages to simplified format
    const relevantMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }));

    // Extract entities from messages
    const entitiesExtracted = this.extractEntities(messages);

    // Generate summary using Gemini
    try {
      const summarizationInput: SummarizationInput = {
        messages: relevantMessages,
        currentMessage,
      };

      const result = await this.geminiClient.summarize(summarizationInput);

      return {
        relevantMessages,
        summary: result.summary,
        entitiesExtracted,
      };
    } catch (error) {
      console.error('Failed to generate summary, using fallback:', error);

      // Fallback: return messages without summary
      return {
        relevantMessages,
        summary: this.generateFallbackSummary(messages),
        entitiesExtracted,
      };
    }
  }

  /**
   * Extract entities (categories, metrics, timeframes) from messages
   */
  private extractEntities(messages: ConversationMessage[]): {
    categories: string[];
    dateRanges: string[];
    metrics: string[];
  } {
    const categories = new Set<string>();
    const dateRanges = new Set<string>();
    const metrics = new Set<string>();

    // Patterns to match
    const categoryPattern = /\((Beer|Sushi|Food|Wine|Liquor|N\/A Beverages)\)/gi;
    const dateRangePattern = /\b(today|yesterday|this week|last week|this month|last month|this year)\b/gi;
    const metricPattern = /\b(sales|revenue|quantity|items sold|performance|trends)\b/gi;

    messages.forEach((msg) => {
      // Extract categories
      let match;
      while ((match = categoryPattern.exec(msg.content)) !== null) {
        categories.add(match[0]);
      }

      // Extract date ranges
      categoryPattern.lastIndex = 0; // Reset regex
      while ((match = dateRangePattern.exec(msg.content)) !== null) {
        dateRanges.add(match[0].toLowerCase());
      }

      // Extract metrics
      dateRangePattern.lastIndex = 0; // Reset regex
      while ((match = metricPattern.exec(msg.content)) !== null) {
        metrics.add(match[0].toLowerCase());
      }
    });

    return {
      categories: Array.from(categories),
      dateRanges: Array.from(dateRanges),
      metrics: Array.from(metrics),
    };
  }

  /**
   * Generate fallback summary without Gemini
   */
  private generateFallbackSummary(messages: ConversationMessage[]): string {
    const userMessages = messages.filter((msg) => msg.role === 'user');

    if (userMessages.length === 0) {
      return 'Conversation started. No user messages yet.';
    }

    const lastUserMessage = userMessages[userMessages.length - 1];
    const conversationLength = messages.length;

    return `Conversation has ${conversationLength} messages. Last user query: "${lastUserMessage.content.substring(0, 100)}${
      lastUserMessage.content.length > 100 ? '...' : ''
    }"`;
  }
}
