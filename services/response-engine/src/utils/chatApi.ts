import { GoogleAuth } from 'google-auth-library';

export interface ChatMessage {
  text: string;
  cards?: any[];
  thread?: {
    name: string;
  };
}

/**
 * Post message to Google Chat using the Chat API
 */
export async function postMessageToChat(
  spaceName: string,
  message: ChatMessage
): Promise<void> {
  try {
    // Use Application Default Credentials (service account)
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/chat.bot']
    });

    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();

    if (!accessToken?.token) {
      throw new Error('Failed to get access token for Chat API');
    }

    const url = `https://chat.googleapis.com/v1/${spaceName}/messages`;

    const body: any = {
      text: message.text
    };

    if (message.thread) {
      body.thread = message.thread;
    }

    if (message.cards && message.cards.length > 0) {
      body.cardsV2 = message.cards.map((card, index) => ({
        cardId: `card_${index}`,
        card
      }));
    }

    console.log('Posting to Chat API:', {
      url,
      hasThread: !!message.thread,
      hasCards: !!(message.cards && message.cards.length > 0)
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chat API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as { name?: string };
    console.log('Chat API success:', result.name);

  } catch (error: any) {
    console.error('Failed to post to Chat:', {
      error: error.message,
      stack: error.stack,
      spaceName
    });
    throw error;
  }
}
