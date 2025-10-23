/**
 * Gmail API client for searching and downloading PMIX reports
 */

import { gmail_v1 } from 'googleapis';
import { OAuth, OAuthTokens } from './OAuth';
import {
  GmailMessage,
  GmailAttachment,
  GmailSearchOptions,
} from '../types';

export class GmailClient {
  private oauth: OAuth;
  private gmail: gmail_v1.Gmail | null = null;

  constructor(projectId: string, oauthSecretName: string) {
    this.oauth = new OAuth(projectId, oauthSecretName);
  }

  /**
   * Initialize Gmail client with OAuth tokens
   */
  async initialize(tokens: OAuthTokens): Promise<void> {
    this.gmail = await this.oauth.createGmailClient(tokens);
  }

  /**
   * Ensure Gmail client is initialized
   */
  private ensureInitialized(): gmail_v1.Gmail {
    if (!this.gmail) {
      throw new Error('GmailClient not initialized. Call initialize() first.');
    }
    return this.gmail;
  }

  /**
   * Search for emails matching query
   */
  async searchEmails(options: GmailSearchOptions): Promise<GmailMessage[]> {
    const gmail = this.ensureInitialized();

    // Build query with optional date filters
    let query = options.query;

    if (options.afterDate) {
      const after = this.formatDate(options.afterDate);
      query += ` after:${after}`;
    }

    if (options.beforeDate) {
      const before = this.formatDate(options.beforeDate);
      query += ` before:${before}`;
    }

    console.log(`Searching Gmail with query: ${query}`);

    // Search for message IDs
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: options.maxResults || 500,
    });

    const messageIds = listResponse.data.messages || [];
    console.log(`Found ${messageIds.length} messages`);

    if (messageIds.length === 0) {
      return [];
    }

    // Fetch full message details for each
    const messages: GmailMessage[] = [];

    for (const { id } of messageIds) {
      if (!id) continue;

      try {
        const message = await this.getMessage(id);
        messages.push(message);
      } catch (error) {
        console.error(`Failed to fetch message ${id}:`, error);
        // Continue with other messages
      }
    }

    return messages;
  }

  /**
   * Get full message details including attachments metadata
   */
  async getMessage(messageId: string): Promise<GmailMessage> {
    const gmail = this.ensureInitialized();

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const message = response.data;

    // Extract headers
    const headers = message.payload?.headers || [];
    const subject = this.getHeader(headers, 'Subject') || 'No Subject';
    const from = this.getHeader(headers, 'From') || 'Unknown';
    const dateStr = this.getHeader(headers, 'Date') || message.internalDate;

    // Parse date
    let date: Date;
    if (dateStr && !dateStr.match(/^\d+$/)) {
      date = new Date(dateStr);
    } else {
      // Use internalDate as fallback (milliseconds since epoch)
      date = new Date(parseInt(message.internalDate || '0', 10));
    }

    // Extract attachments metadata
    const attachments = this.extractAttachments(message.payload);

    return {
      id: messageId,
      threadId: message.threadId || '',
      internalDate: message.internalDate || '',
      subject,
      from,
      date,
      attachments,
    };
  }

  /**
   * Download attachment data
   */
  async downloadAttachment(
    messageId: string,
    attachmentId: string
  ): Promise<Buffer> {
    const gmail = this.ensureInitialized();

    const response = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    const data = response.data.data;
    if (!data) {
      throw new Error('Attachment data is empty');
    }

    // Decode base64url to buffer
    const buffer = Buffer.from(data, 'base64url');
    return buffer;
  }

  /**
   * Download all PDF attachments from a message
   */
  async downloadPdfAttachments(message: GmailMessage): Promise<GmailAttachment[]> {
    const pdfAttachments = message.attachments.filter(
      (att) =>
        att.mimeType === 'application/pdf' ||
        att.filename.toLowerCase().endsWith('.pdf')
    );

    const attachmentsWithData: GmailAttachment[] = [];

    for (const attachment of pdfAttachments) {
      try {
        const data = await this.downloadAttachment(
          message.id,
          attachment.attachmentId
        );

        attachmentsWithData.push({
          ...attachment,
          data,
        });

        console.log(
          `Downloaded PDF: ${attachment.filename} (${attachment.size} bytes)`
        );
      } catch (error) {
        console.error(
          `Failed to download attachment ${attachment.filename}:`,
          error
        );
        // Continue with other attachments
      }
    }

    return attachmentsWithData;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get header value by name
   */
  private getHeader(
    headers: gmail_v1.Schema$MessagePartHeader[],
    name: string
  ): string | null {
    const header = headers.find(
      (h) => h.name?.toLowerCase() === name.toLowerCase()
    );
    return header?.value || null;
  }

  /**
   * Extract attachments from message payload
   */
  private extractAttachments(
    payload: gmail_v1.Schema$MessagePart | undefined
  ): GmailAttachment[] {
    const attachments: GmailAttachment[] = [];

    if (!payload) {
      return attachments;
    }

    // Check if this part is an attachment
    if (payload.filename && payload.body?.attachmentId) {
      attachments.push({
        filename: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0,
        attachmentId: payload.body.attachmentId,
      });
    }

    // Recursively check parts
    if (payload.parts) {
      for (const part of payload.parts) {
        attachments.push(...this.extractAttachments(part));
      }
    }

    return attachments;
  }

  /**
   * Format date for Gmail search (YYYY/MM/DD)
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }
}
