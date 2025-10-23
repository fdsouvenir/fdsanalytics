/**
 * GeminiClient - Interface to Gemini API for conversation summarization
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { config } from '../config/config';

export interface SummarizationInput {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  currentMessage: string;
}

export interface SummarizationResult {
  summary: string;
  method: 'gemini' | 'fallback';
  confidence?: number;
}

export class GeminiClient {
  private genAI: GoogleGenerativeAI | null = null;
  private apiKey: string | null = null;
  private initialized: boolean = false;

  /**
   * Initialize Gemini client with API key from Secret Manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Retrieve API key from Secret Manager
      const secretClient = new SecretManagerServiceClient();
      const secretPath = `projects/${config.projectId}/secrets/${config.geminiSecretName}/versions/latest`;

      const [version] = await secretClient.accessSecretVersion({
        name: secretPath,
      });

      this.apiKey = version.payload?.data ? Buffer.from(version.payload.data as Uint8Array).toString('utf8') : null;

      if (!this.apiKey) {
        throw new Error('Failed to retrieve Gemini API key from Secret Manager');
      }

      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.initialized = true;

      console.log('Gemini client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Gemini client:', error);
      throw error;
    }
  }

  /**
   * Summarize conversation context using Gemini Flash
   */
  async summarize(input: SummarizationInput): Promise<SummarizationResult> {
    if (!this.initialized || !this.genAI) {
      throw new Error('GeminiClient not initialized. Call initialize() first.');
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: config.geminiModel });

      // Build prompt for summarization
      const prompt = this.buildSummarizationPrompt(input);

      // Generate summary
      const result = await model.generateContent(prompt);
      const response = result.response;
      const summary = response.text();

      return {
        summary: summary.trim(),
        method: 'gemini',
        confidence: 0.9, // High confidence for Gemini-generated summaries
      };
    } catch (error) {
      console.error('Gemini summarization failed:', error);

      // Fallback to simple concatenation
      return this.fallbackSummarize(input);
    }
  }

  /**
   * Build prompt for Gemini summarization
   */
  private buildSummarizationPrompt(input: SummarizationInput): string {
    const conversationHistory = input.messages
      .map((msg) => {
        const timestamp = msg.timestamp.toISOString();
        return `[${msg.role} - ${timestamp}]: ${msg.content}`;
      })
      .join('\n');

    return `You are a helpful assistant analyzing a conversation between a user and a restaurant analytics chatbot.

Previous conversation:
${conversationHistory}

Current user message: "${input.currentMessage}"

Task: Provide a concise 2-3 sentence summary of the conversation context that would help answer the current question. Focus on:
1. What topics has the user been asking about?
2. What data/categories/timeframes were previously discussed?
3. Any patterns or trends in the user's questions?

Format: "User has been asking about X. Previously discussed Y. Current focus seems to be Z."

Summary:`;
  }

  /**
   * Fallback summarization without Gemini (simple concatenation)
   */
  private fallbackSummarize(input: SummarizationInput): SummarizationResult {
    // Simple fallback: extract key phrases from recent messages
    const recentMessages = input.messages.slice(-5); // Last 5 messages
    const topics: string[] = [];

    // Extract potential topics (categories, metrics, timeframes)
    const topicPatterns = [
      /\(Beer\)/gi,
      /\(Sushi\)/gi,
      /\(Food\)/gi,
      /\(Wine\)/gi,
      /\(Liquor\)/gi,
      /sales/gi,
      /today|yesterday|this week|last week|this month/gi,
    ];

    recentMessages.forEach((msg) => {
      topicPatterns.forEach((pattern) => {
        const matches = msg.content.match(pattern);
        if (matches) {
          matches.forEach((match) => {
            if (!topics.includes(match.toLowerCase())) {
              topics.push(match.toLowerCase());
            }
          });
        }
      });
    });

    const summary = topics.length > 0
      ? `User has been discussing: ${topics.join(', ')}. Recent conversation focused on restaurant analytics.`
      : 'User is asking about restaurant analytics. No specific context from previous messages.';

    return {
      summary,
      method: 'fallback',
      confidence: 0.5, // Lower confidence for fallback
    };
  }

  /**
   * Health check for Gemini API
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.initialized) {
        await this.initialize();
      }
      return this.initialized;
    } catch (error) {
      console.error('Gemini health check failed:', error);
      return false;
    }
  }
}
