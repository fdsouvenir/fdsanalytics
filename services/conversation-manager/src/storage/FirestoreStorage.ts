/**
 * FirestoreStorage - Handles message persistence in Firestore
 *
 * Provides immediate read-after-write consistency for conversation history,
 * solving the BigQuery streaming buffer delay issue.
 */

import { Firestore, CollectionReference, DocumentData } from '@google-cloud/firestore';
import { config } from '../config/config';

export interface ConversationMessage {
  conversationId: string;
  tenantId: string;
  userId: string;
  threadId: string;
  workspaceId?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageId?: string;
  contextSummary?: string;
  toolCalls?: any;
  expirationTimestamp?: Date;
}

export interface GetContextParams {
  userId: string;
  threadId: string;
  maxMessages?: number;
}

export class FirestoreStorage {
  private firestore: Firestore;
  private messagesCollection: CollectionReference<DocumentData>;

  constructor() {
    this.firestore = new Firestore({
      projectId: config.projectId
    });

    // Collection: conversations/{threadId}/messages/{messageId}
    this.messagesCollection = this.firestore.collection('conversation_messages');
  }

  /**
   * Store a message in Firestore with retry logic
   */
  async storeMessage(message: ConversationMessage): Promise<void> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.insertMessage(message);
        console.log(`Message stored successfully: ${message.conversationId}`);
        return;
      } catch (error) {
        lastError = error as Error;
        console.warn(`Store message attempt ${attempt}/${maxRetries} failed:`, error);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delayMs = Math.pow(2, attempt - 1) * 1000;
          await this.sleep(delayMs);
        }
      }
    }

    throw new Error(
      `Failed to store message after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Insert message into Firestore
   */
  private async insertMessage(message: ConversationMessage): Promise<void> {
    // Use conversationId as document ID for deduplication
    const docRef = this.messagesCollection.doc(message.conversationId);

    const doc = {
      conversationId: message.conversationId,
      tenantId: message.tenantId,
      userId: message.userId,
      threadId: message.threadId,
      workspaceId: message.workspaceId || null,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      messageId: message.messageId || null,
      contextSummary: message.contextSummary || null,
      toolCalls: message.toolCalls || null,
      expirationTimestamp: message.expirationTimestamp || this.calculateExpirationTimestamp(message.timestamp),
    };

    await docRef.set(doc);
  }

  /**
   * Retrieve conversation context (last N messages)
   * With immediate read-after-write consistency
   */
  async getContext(params: GetContextParams): Promise<ConversationMessage[]> {
    const maxMessages = params.maxMessages || config.maxConversationHistory;

    try {
      // Query for messages in this thread
      const querySnapshot = await this.messagesCollection
        .where('threadId', '==', params.threadId)
        .where('userId', '==', params.userId)
        .orderBy('timestamp', 'desc')
        .limit(maxMessages)
        .get();

      if (querySnapshot.empty) {
        return [];
      }

      // Convert documents to ConversationMessage objects
      const messages = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          conversationId: data.conversationId,
          tenantId: data.tenantId,
          userId: data.userId,
          threadId: data.threadId,
          workspaceId: data.workspaceId,
          role: data.role as 'user' | 'assistant',
          content: data.content,
          timestamp: data.timestamp.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
          messageId: data.messageId,
          contextSummary: data.contextSummary,
          toolCalls: data.toolCalls,
        };
      });

      // Reverse to get chronological order (oldest to newest)
      return messages.reverse();
    } catch (error) {
      console.error('Failed to retrieve conversation context:', error);
      // Return empty array on error (graceful degradation)
      return [];
    }
  }

  /**
   * Check if Firestore is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Try to read a document (or check collection exists)
      await this.messagesCollection.limit(1).get();
      return true;
    } catch (error) {
      console.error('Firestore health check failed:', error);
      return false;
    }
  }

  /**
   * Calculate expiration timestamp (90 days from now)
   */
  private calculateExpirationTimestamp(timestamp: Date): Date {
    const expiration = new Date(timestamp);
    expiration.setDate(expiration.getDate() + 90);
    return expiration;
  }

  /**
   * Sleep utility for retry backoff
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate unique conversation ID
   */
  static generateConversationId(
    tenantId: string,
    threadId: string,
    timestamp: Date
  ): string {
    return `${tenantId}-${threadId}-${timestamp.getTime()}`;
  }

  /**
   * Delete old messages past expiration (for cleanup jobs)
   */
  async deleteExpiredMessages(): Promise<number> {
    try {
      const now = new Date();
      const querySnapshot = await this.messagesCollection
        .where('expirationTimestamp', '<', now)
        .limit(500) // Batch delete
        .get();

      if (querySnapshot.empty) {
        return 0;
      }

      const batch = this.firestore.batch();
      querySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      console.log(`Deleted ${querySnapshot.docs.length} expired messages`);
      return querySnapshot.docs.length;
    } catch (error) {
      console.error('Failed to delete expired messages:', error);
      return 0;
    }
  }
}
