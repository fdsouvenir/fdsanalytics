/**
 * Unit tests for IngestionService
 */

import { IngestionService } from '../../src/core/IngestionService';
import { GmailClient } from '../../src/gmail/GmailClient';
import { ReportProcessor } from '../../src/core/ReportProcessor';
import { loadConfig } from '../../src/config/config';

// Mock dependencies
jest.mock('../../src/gmail/GmailClient');
jest.mock('../../src/core/ReportProcessor');

describe('IngestionService', () => {
  let service: IngestionService;
  let mockGmailClient: jest.Mocked<GmailClient>;
  let mockProcessor: jest.Mocked<ReportProcessor>;

  beforeEach(() => {
    mockGmailClient = new GmailClient('test', 'test') as jest.Mocked<GmailClient>;
    mockProcessor = {} as jest.Mocked<ReportProcessor>;

    const config = loadConfig();
    service = new IngestionService(mockGmailClient, mockProcessor, config);
  });

  describe('ingestNewReports', () => {
    it('should process new emails successfully', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          internalDate: '1729584000000',
          subject: 'Daily PMIX Report',
          from: 'spoton@example.com',
          date: new Date('2025-10-22'),
          attachments: [],
        },
      ];

      const mockAttachments = [
        {
          filename: 'pmix-2025-10-22.pdf',
          mimeType: 'application/pdf',
          size: 50000,
          attachmentId: 'att-1',
          data: Buffer.from('mock pdf data'),
        },
      ];

      mockGmailClient.initialize = jest.fn().mockResolvedValue(undefined);
      mockGmailClient.searchEmails = jest.fn().mockResolvedValue(mockMessages);
      mockGmailClient.downloadPdfAttachments = jest.fn().mockResolvedValue(mockAttachments);

      mockProcessor.processReport = jest.fn().mockResolvedValue({
        success: true,
        reportDate: new Date('2025-10-22'),
        reportId: '2025-10-22-pmix-senso',
        rowsInserted: 150,
        durationMs: 5000,
      });

      const oauthTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      const result = await service.ingestNewReports('senso-sushi', oauthTokens);

      expect(result.totalProcessed).toBe(1);
      expect(result.successCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.skippedCount).toBe(0);

      expect(mockGmailClient.initialize).toHaveBeenCalledWith(oauthTokens);
      expect(mockGmailClient.searchEmails).toHaveBeenCalled();
      expect(mockProcessor.processReport).toHaveBeenCalledTimes(1);
    });

    it('should handle messages with no PDF attachments', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          internalDate: '1729584000000',
          subject: 'Daily PMIX Report',
          from: 'spoton@example.com',
          date: new Date('2025-10-22'),
          attachments: [],
        },
      ];

      mockGmailClient.initialize = jest.fn().mockResolvedValue(undefined);
      mockGmailClient.searchEmails = jest.fn().mockResolvedValue(mockMessages);
      mockGmailClient.downloadPdfAttachments = jest.fn().mockResolvedValue([]);

      const oauthTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      const result = await service.ingestNewReports('senso-sushi', oauthTokens);

      expect(result.totalProcessed).toBe(1);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.skippedCount).toBe(1);
    });

    it('should handle processing failures', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          threadId: 'thread-1',
          internalDate: '1729584000000',
          subject: 'Daily PMIX Report',
          from: 'spoton@example.com',
          date: new Date('2025-10-22'),
          attachments: [],
        },
      ];

      const mockAttachments = [
        {
          filename: 'pmix-2025-10-22.pdf',
          mimeType: 'application/pdf',
          size: 50000,
          attachmentId: 'att-1',
          data: Buffer.from('mock pdf data'),
        },
      ];

      mockGmailClient.initialize = jest.fn().mockResolvedValue(undefined);
      mockGmailClient.searchEmails = jest.fn().mockResolvedValue(mockMessages);
      mockGmailClient.downloadPdfAttachments = jest.fn().mockResolvedValue(mockAttachments);

      mockProcessor.processReport = jest.fn().mockResolvedValue({
        success: false,
        error: 'Failed to parse PDF',
        durationMs: 2000,
      });

      const oauthTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      };

      const result = await service.ingestNewReports('senso-sushi', oauthTokens);

      expect(result.totalProcessed).toBe(1);
      expect(result.successCount).toBe(0);
      expect(result.failedCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Failed to parse PDF');
    });
  });
});
