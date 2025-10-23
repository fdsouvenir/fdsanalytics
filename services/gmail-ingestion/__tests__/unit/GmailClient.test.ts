/**
 * Unit tests for GmailClient
 */

import { GmailClient } from '../../src/gmail/GmailClient';

// Mock dependencies
jest.mock('../../src/gmail/OAuth');
jest.mock('googleapis');

describe('GmailClient', () => {
  let client: GmailClient;

  beforeEach(() => {
    client = new GmailClient('test-project', 'test-secret');
  });

  describe('detectReportType', () => {
    it('should correctly format dates for Gmail search', () => {
      const date = new Date('2025-10-22');
      const formatted = (client as any).formatDate(date);
      expect(formatted).toBe('2025/10/22');
    });
  });

  describe('extractAttachments', () => {
    it('should extract PDF attachments from message payload', () => {
      const payload = {
        parts: [
          {
            filename: 'report.pdf',
            mimeType: 'application/pdf',
            body: {
              attachmentId: 'att-123',
              size: 50000,
            },
          },
          {
            filename: '',
            mimeType: 'text/plain',
            body: {},
          },
        ],
      };

      const attachments = (client as any).extractAttachments(payload);

      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('report.pdf');
      expect(attachments[0].mimeType).toBe('application/pdf');
      expect(attachments[0].attachmentId).toBe('att-123');
    });

    it('should handle nested parts', () => {
      const payload = {
        parts: [
          {
            mimeType: 'multipart/mixed',
            parts: [
              {
                filename: 'nested.pdf',
                mimeType: 'application/pdf',
                body: {
                  attachmentId: 'att-456',
                  size: 30000,
                },
              },
            ],
          },
        ],
      };

      const attachments = (client as any).extractAttachments(payload);

      expect(attachments).toHaveLength(1);
      expect(attachments[0].filename).toBe('nested.pdf');
    });

    it('should return empty array for no attachments', () => {
      const payload = {
        parts: [
          {
            mimeType: 'text/html',
            body: {},
          },
        ],
      };

      const attachments = (client as any).extractAttachments(payload);
      expect(attachments).toHaveLength(0);
    });
  });

  describe('getHeader', () => {
    it('should extract header value by name', () => {
      const headers = [
        { name: 'Subject', value: 'Test Email' },
        { name: 'From', value: 'test@example.com' },
        { name: 'Date', value: 'Wed, 22 Oct 2025 10:00:00 -0500' },
      ];

      const subject = (client as any).getHeader(headers, 'Subject');
      expect(subject).toBe('Test Email');

      const from = (client as any).getHeader(headers, 'From');
      expect(from).toBe('test@example.com');
    });

    it('should be case-insensitive', () => {
      const headers = [{ name: 'Subject', value: 'Test' }];

      const subject = (client as any).getHeader(headers, 'subject');
      expect(subject).toBe('Test');
    });

    it('should return null for missing header', () => {
      const headers = [{ name: 'Subject', value: 'Test' }];

      const missing = (client as any).getHeader(headers, 'To');
      expect(missing).toBeNull();
    });
  });
});
