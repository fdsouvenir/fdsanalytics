/**
 * Unit tests for ContextSummarizer
 */

import { ContextSummarizer } from '../../src/core/ContextSummarizer';
import { GeminiClient } from '../../src/gemini/GeminiClient';
import { mockMessages, mockEmptyConversation } from '../fixtures/mockMessages';

// Mock GeminiClient
jest.mock('../../src/gemini/GeminiClient');

describe('ContextSummarizer', () => {
  let summarizer: ContextSummarizer;
  let mockGeminiClient: jest.Mocked<GeminiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGeminiClient = new GeminiClient() as jest.Mocked<GeminiClient>;
    summarizer = new ContextSummarizer(mockGeminiClient);
  });

  describe('summarize', () => {
    it('should handle empty conversation', async () => {
      const result = await summarizer.summarize(mockEmptyConversation, 'Hello');

      expect(result.relevantMessages).toEqual([]);
      expect(result.summary).toContain('New conversation');
      expect(result.entitiesExtracted).toEqual({
        categories: [],
        dateRanges: [],
        metrics: [],
      });
    });

    it('should generate summary using Gemini', async () => {
      mockGeminiClient.summarize.mockResolvedValue({
        summary: 'User has been asking about beer sales this week. Previously discussed sushi category.',
        method: 'gemini',
        confidence: 0.9,
      });

      const result = await summarizer.summarize(mockMessages, 'What about wine?');

      expect(result.relevantMessages).toHaveLength(5);
      expect(result.summary).toContain('beer sales');
      expect(mockGeminiClient.summarize).toHaveBeenCalledTimes(1);
    });

    it('should extract entities from messages', async () => {
      mockGeminiClient.summarize.mockResolvedValue({
        summary: 'Test summary',
        method: 'gemini',
        confidence: 0.9,
      });

      const result = await summarizer.summarize(mockMessages, 'Current message');

      expect(result.entitiesExtracted?.categories).toContain('(Sushi)');
      expect(result.entitiesExtracted?.dateRanges).toContain('this week');
      expect(result.entitiesExtracted?.metrics).toContain('sales');
    });

    it('should use fallback summary on Gemini failure', async () => {
      mockGeminiClient.summarize.mockRejectedValue(new Error('Gemini API error'));

      const result = await summarizer.summarize(mockMessages, 'Current message');

      expect(result.relevantMessages).toHaveLength(5);
      expect(result.summary).toBeDefined();
      expect(result.summary).toContain('Conversation has');
    });

    it('should include last user message in fallback summary', async () => {
      mockGeminiClient.summarize.mockRejectedValue(new Error('Gemini API error'));

      const result = await summarizer.summarize(mockMessages, 'Current message');

      expect(result.summary).toContain('Show me the trend for this month');
    });

    it('should extract multiple categories', async () => {
      const messagesWithCategories = [
        {
          ...mockMessages[0],
          content: 'How are (Beer) and (Wine) sales?',
        },
        {
          ...mockMessages[1],
          content: 'Also check (Sushi) and (Food) categories.',
        },
      ];

      mockGeminiClient.summarize.mockResolvedValue({
        summary: 'Test summary',
        method: 'gemini',
        confidence: 0.9,
      });

      const result = await summarizer.summarize(messagesWithCategories, 'Current');

      expect(result.entitiesExtracted?.categories).toContain('(Beer)');
      expect(result.entitiesExtracted?.categories).toContain('(Wine)');
      expect(result.entitiesExtracted?.categories).toContain('(Sushi)');
      expect(result.entitiesExtracted?.categories).toContain('(Food)');
    });

    it('should extract date ranges', async () => {
      const messagesWithDates = [
        {
          ...mockMessages[0],
          content: 'Sales for today and yesterday',
        },
        {
          ...mockMessages[1],
          content: 'Compare this week vs last week and this month',
        },
      ];

      mockGeminiClient.summarize.mockResolvedValue({
        summary: 'Test summary',
        method: 'gemini',
        confidence: 0.9,
      });

      const result = await summarizer.summarize(messagesWithDates, 'Current');

      expect(result.entitiesExtracted?.dateRanges).toContain('today');
      expect(result.entitiesExtracted?.dateRanges).toContain('yesterday');
      expect(result.entitiesExtracted?.dateRanges).toContain('this week');
      expect(result.entitiesExtracted?.dateRanges).toContain('last week');
      expect(result.entitiesExtracted?.dateRanges).toContain('this month');
    });

    it('should extract metrics', async () => {
      const messagesWithMetrics = [
        {
          ...mockMessages[0],
          content: 'Show me sales and revenue trends',
        },
        {
          ...mockMessages[1],
          content: 'What about quantity and items sold?',
        },
      ];

      mockGeminiClient.summarize.mockResolvedValue({
        summary: 'Test summary',
        method: 'gemini',
        confidence: 0.9,
      });

      const result = await summarizer.summarize(messagesWithMetrics, 'Current');

      expect(result.entitiesExtracted?.metrics).toContain('sales');
      expect(result.entitiesExtracted?.metrics).toContain('revenue');
      expect(result.entitiesExtracted?.metrics).toContain('quantity');
    });
  });
});
