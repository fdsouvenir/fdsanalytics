import axios, { AxiosInstance } from 'axios';
import { GoogleAuth } from 'google-auth-library';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ConversationContext {
  relevantMessages: ConversationMessage[];
  summary?: string;
  entitiesExtracted?: {
    categories?: string[];
    dateRanges?: string[];
    metrics?: string[];
  };
}

interface GetContextRequest {
  userId: string;
  threadId: string;
  currentMessage: string;
  maxMessages?: number;
}

interface StoreMessageRequest {
  userId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * ConversationClient - Calls Conversation Manager service
 *
 * Handles:
 * - Getting conversation context
 * - Storing messages
 * - Fallback to empty context on failure
 * - Service-to-service authentication
 */
export class ConversationClient {
  private client: AxiosInstance;
  private auth: GoogleAuth;

  constructor(
    private conversationManagerUrl: string,
    private timeout: number = 30000
  ) {
    this.client = axios.create({
      baseURL: conversationManagerUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.auth = new GoogleAuth();
  }

  /**
   * Get authorization header with identity token from metadata server
   */
  private async getAuthHeaders(): Promise<Record<string, string>> {
    try {
      // Use the metadata server to get an identity token for the target audience
      const metadataServerUrl = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
      const response = await axios.get(metadataServerUrl, {
        params: { audience: this.conversationManagerUrl },
        headers: { 'Metadata-Flavor': 'Google' },
        timeout: 5000
      });

      const idToken = response.data;
      return { 'Authorization': `Bearer ${idToken}` };
    } catch (error: any) {
      console.warn('Failed to get auth token from metadata server, proceeding without auth', {
        error: error.message
      });
      return {};
    }
  }

  /**
   * Get conversation context from history
   * Falls back to empty context on failure
   */
  async getContext(
    userId: string,
    threadId: string,
    currentMessage: string,
    maxMessages: number = 10
  ): Promise<ConversationContext> {
    try {
      const request: GetContextRequest = {
        userId,
        threadId,
        currentMessage,
        maxMessages
      };

      const authHeaders = await this.getAuthHeaders();
      const response = await this.client.post<ConversationContext>('/get-context', request, {
        headers: authHeaders
      });
      return response.data;
    } catch (error: any) {
      console.warn('Failed to get conversation context, proceeding without history', {
        error: error.message,
        userId,
        threadId
      });

      // Fallback: return empty context
      return {
        relevantMessages: [],
        summary: undefined
      };
    }
  }

  /**
   * Store message in conversation history
   * Errors are logged but not thrown
   */
  async storeMessage(
    userId: string,
    threadId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    try {
      const request: StoreMessageRequest = {
        userId,
        threadId,
        role,
        content
      };

      const authHeaders = await this.getAuthHeaders();
      await this.client.post('/store-message', request, {
        headers: authHeaders
      });
    } catch (error: any) {
      console.error('Failed to store message in conversation history', {
        error: error.message,
        userId,
        threadId,
        role
      });
      // Don't throw - this is not critical
    }
  }
}
