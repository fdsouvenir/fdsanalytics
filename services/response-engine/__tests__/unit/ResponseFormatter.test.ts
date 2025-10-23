import { ResponseFormatter } from '../../src/core/ResponseFormatter';

describe('ResponseFormatter', () => {
  let formatter: ResponseFormatter;

  beforeEach(() => {
    formatter = new ResponseFormatter('USD');
  });

  describe('formatResponse', () => {
    it('should format text-only response', () => {
      const result = formatter.formatResponse(
        'Sales today: $5,234',
        null,
        undefined,
        'thread123'
      );

      expect(result.text).toBe('Sales today: $5,234');
      expect(result.cards).toBeUndefined();
      expect(result.threadId).toBe('thread123');
      expect(result.responseType).toBe('NEW_MESSAGE');
    });

    it('should format response with chart', () => {
      const result = formatter.formatResponse(
        'Here are your sales by category:',
        'https://quickchart.io/chart?c=...',
        'Sales by Category',
        'thread123'
      );

      expect(result.text).toBe('Here are your sales by category:');
      expect(result.cards).toHaveLength(1);
      expect(result.cards?.[0].header?.title).toBe('Sales by Category');
      expect(result.cards?.[0].sections[0].widgets[0].image.imageUrl).toContain('quickchart.io');
    });

    it('should format response without threadId', () => {
      const result = formatter.formatResponse('Test', null);

      expect(result.threadId).toBeUndefined();
    });
  });

  describe('formatCurrency', () => {
    it('should format currency in USD', () => {
      const result = formatter.formatCurrency(5234.50);

      expect(result).toBe('$5,234.50');
    });

    it('should handle negative values', () => {
      const result = formatter.formatCurrency(-1234.50);

      expect(result).toBe('-$1,234.50');
    });

    it('should handle zero', () => {
      const result = formatter.formatCurrency(0);

      expect(result).toBe('$0.00');
    });
  });

  describe('formatPercentage', () => {
    it('should format positive percentage', () => {
      const result = formatter.formatPercentage(12.5);

      expect(result).toBe('+12.5%');
    });

    it('should format negative percentage', () => {
      const result = formatter.formatPercentage(-8.3);

      expect(result).toBe('-8.3%');
    });

    it('should format zero', () => {
      const result = formatter.formatPercentage(0);

      expect(result).toBe('+0.0%');
    });
  });

  describe('addTrendIndicator', () => {
    it('should return up arrow for positive value', () => {
      const result = formatter.addTrendIndicator(10);

      expect(result).toBe('↑');
    });

    it('should return down arrow for negative value', () => {
      const result = formatter.addTrendIndicator(-10);

      expect(result).toBe('↓');
    });

    it('should return right arrow for zero', () => {
      const result = formatter.addTrendIndicator(0);

      expect(result).toBe('→');
    });
  });

  describe('formatList', () => {
    it('should format list of items', () => {
      const result = formatter.formatList(['Beer', 'Sushi', 'Food']);

      expect(result).toBe('• Beer\n• Sushi\n• Food');
    });

    it('should handle empty list', () => {
      const result = formatter.formatList([]);

      expect(result).toBe('');
    });

    it('should handle single item', () => {
      const result = formatter.formatList(['Beer']);

      expect(result).toBe('• Beer');
    });
  });

  describe('formatError', () => {
    it('should format error message', () => {
      const result = formatter.formatError('Category not found');

      expect(result.text).toContain('Category not found');
      expect(result.responseType).toBe('NEW_MESSAGE');
    });

    it('should include suggestions if provided', () => {
      const result = formatter.formatError('Category not found', ['Beer', 'Sushi']);

      expect(result.text).toContain('Suggestions:');
      expect(result.text).toContain('• Beer');
      expect(result.text).toContain('• Sushi');
    });
  });

  describe('formatNoData', () => {
    it('should format no data message', () => {
      const result = formatter.formatNoData('beer sales yesterday');

      expect(result.text).toContain('beer sales yesterday');
      expect(result.text).toContain('couldn\'t find any data');
      expect(result.responseType).toBe('NEW_MESSAGE');
    });
  });
});
