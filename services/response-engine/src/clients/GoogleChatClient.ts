import axios, { AxiosInstance } from 'axios';

interface Card {
  header?: {
    title: string;
    subtitle?: string;
  };
  sections: Section[];
}

interface Section {
  widgets: Widget[];
}

type Widget = TextWidget | ImageWidget | ButtonWidget;

interface TextWidget {
  textParagraph: { text: string };
}

interface ImageWidget {
  image: {
    imageUrl: string;
    altText: string;
  };
}

interface ButtonWidget {
  buttons: Array<{
    textButton: {
      text: string;
      onClick: { openLink: { url: string } };
    };
  }>;
}

interface GoogleChatMessage {
  text: string;
  cardsV2?: Array<{
    cardId: string;
    card: Card;
  }>;
  thread?: {
    threadKey: string;
  };
}

/**
 * GoogleChatClient - Send messages to Google Chat
 *
 * Note: In Cloud Function deployment, Google Chat automatically
 * receives the response from the webhook handler.
 * This client is primarily for testing and future webhook calls.
 */
export class GoogleChatClient {
  private client: AxiosInstance;

  constructor(timeout: number = 30000) {
    this.client = axios.create({
      timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Send message to Google Chat space
   * @param spaceWebhookUrl Google Chat webhook URL
   * @param message Message to send
   */
  async sendMessage(spaceWebhookUrl: string, message: GoogleChatMessage): Promise<void> {
    try {
      await this.client.post(spaceWebhookUrl, message);
    } catch (error: any) {
      console.error('Failed to send message to Google Chat', {
        error: error.message
      });
      throw new Error('Failed to send message to Google Chat');
    }
  }

  /**
   * Format response for Google Chat webhook
   * This method returns the response object that should be returned from the webhook handler
   */
  formatWebhookResponse(
    text: string,
    cards?: Card[],
    threadKey?: string
  ): GoogleChatMessage {
    const message: GoogleChatMessage = {
      text
    };

    if (cards && cards.length > 0) {
      message.cardsV2 = cards.map((card, index) => ({
        cardId: `card_${index}`,
        card
      }));
    }

    if (threadKey) {
      message.thread = {
        threadKey
      };
    }

    return message;
  }

  /**
   * Create chart card for Google Chat
   */
  createChartCard(chartUrl: string, title: string, subtitle?: string): Card {
    const card: Card = {
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

    if (title || subtitle) {
      card.header = {
        title: title || 'Chart',
        subtitle
      };
    }

    return card;
  }
}
