import { ChartSpec } from '../chart/chartTypes';

interface Card {
  header?: {
    title: string;
    subtitle?: string;
  };
  sections: Array<{
    widgets: any[];
  }>;
}

export interface FormattedResponse {
  text: string;
  cardsV2?: Array<{
    cardId: string;
    card: Card;
  }>;
  // Optional action response for future use
  actionResponse?: {
    type: 'UPDATE_MESSAGE' | 'NEW_MESSAGE';
  };
}

/**
 * ResponseFormatter - Format responses for Google Chat
 *
 * Handles:
 * - Text formatting (bold, italics, lists)
 * - Card creation with charts
 * - Trend indicators (up/down arrows)
 * - Currency formatting
 */
export class ResponseFormatter {
  constructor(private currency: string = 'USD') {}

  /**
   * Format response with optional chart
   */
  formatResponse(
    text: string,
    chartUrl: string | null,
    chartTitle?: string
  ): FormattedResponse {
    const response: FormattedResponse = {
      text: this.formatText(text)
    };

    if (chartUrl && chartTitle) {
      response.cardsV2 = [{
        cardId: `chart_${Date.now()}`,
        card: this.createChartCard(chartUrl, chartTitle)
      }];
    }

    return response;
  }

  /**
   * Format text with markdown-style formatting for Google Chat
   */
  private formatText(text: string): string {
    // Google Chat supports:
    // *bold* _italic_ ~strikethrough~
    // Lists with • or -
    // Links with <url|text>
    return text;
  }

  /**
   * Create chart card
   */
  private createChartCard(chartUrl: string, title: string): Card {
    return {
      header: {
        title
      },
      sections: [
        {
          widgets: [
            {
              image: {
                imageUrl: chartUrl,
                altText: title
              }
            }
          ]
        }
      ]
    };
  }

  /**
   * Format currency value
   */
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency
    }).format(value);
  }

  /**
   * Format percentage
   */
  formatPercentage(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  }

  /**
   * Add trend indicator
   */
  addTrendIndicator(value: number): string {
    if (value > 0) {
      return '↑';
    } else if (value < 0) {
      return '↓';
    }
    return '→';
  }

  /**
   * Format list of items
   */
  formatList(items: string[]): string {
    return items.map(item => `• ${item}`).join('\n');
  }

  /**
   * Format error message for user
   */
  formatError(error: string, suggestions?: string[]): FormattedResponse {
    let text = `I encountered an issue: ${error}`;

    if (suggestions && suggestions.length > 0) {
      text += '\n\nSuggestions:\n' + this.formatList(suggestions);
    }

    return {
      text
    };
  }

  /**
   * Format "no data" message
   */
  formatNoData(query: string): FormattedResponse {
    return {
      text: `I couldn't find any data for "${query}". Try adjusting your date range or category.`
    };
  }
}
