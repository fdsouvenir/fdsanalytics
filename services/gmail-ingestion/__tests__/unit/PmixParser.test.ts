/**
 * Unit tests for PMIX Parser
 */

import { PmixParser } from '../../src/parsers/PmixParser';

// Mock Gemini API
jest.mock('@google/generative-ai');
jest.mock('@google-cloud/secret-manager');

describe('PmixParser', () => {
  let parser: PmixParser;

  beforeEach(() => {
    parser = new PmixParser('test-project', 'test-secret', 'gemini-2.5-flash-lite');
  });

  describe('canParse', () => {
    it('should detect PMIX reports by filename', () => {
      expect(parser.canParse('pmix-report-2025-10-22.pdf', 'Daily Report')).toBe(true);
      expect(parser.canParse('product-mix-2025-10-22.pdf', 'Daily Report')).toBe(true);
    });

    it('should detect PMIX reports by subject', () => {
      expect(parser.canParse('report.pdf', 'Daily Product Mix Report')).toBe(true);
      expect(parser.canParse('report.pdf', 'PMIX Report for Senso')).toBe(true);
    });

    it('should not detect non-PMIX reports', () => {
      expect(parser.canParse('labor-report.pdf', 'Labor Report')).toBe(false);
      expect(parser.canParse('invoice.pdf', 'Invoice #1234')).toBe(false);
    });
  });

  describe('getReportType', () => {
    it('should return pmix as report type', () => {
      expect(parser.getReportType()).toBe('pmix');
    });
  });

  describe('parseGeminiResponse', () => {
    it('should parse valid JSON response', () => {
      const geminiResponse = `{
        "report_date": "2025-10-22",
        "business_date": "2025-10-22",
        "location_name": "Senso Sushi",
        "location_id": "senso-frankfort",
        "metrics": [
          {
            "metric_name": "net_sales",
            "metric_value": "$1,234.56",
            "primary_category": "(Beer)",
            "dimensions": {
              "category": "Bottle Beer",
              "item_name": "Budweiser"
            }
          }
        ]
      }`;

      const parsed = (parser as any).parseGeminiResponse(geminiResponse);

      expect(parsed.report_date).toBe('2025-10-22');
      expect(parsed.metrics).toHaveLength(1);
      expect(parsed.metrics[0].primary_category).toBe('(Beer)');
    });

    it('should handle markdown code blocks', () => {
      const geminiResponse = `\`\`\`json
{
  "report_date": "2025-10-22",
  "metrics": []
}
\`\`\``;

      const parsed = (parser as any).parseGeminiResponse(geminiResponse);
      expect(parsed.report_date).toBe('2025-10-22');
    });

    it('should throw error for invalid JSON', () => {
      const invalidResponse = 'This is not JSON';

      expect(() => {
        (parser as any).parseGeminiResponse(invalidResponse);
      }).toThrow('Invalid JSON response from Gemini');
    });
  });

  describe('validateReport', () => {
    it('should validate report with metrics', () => {
      const report = {
        reportDate: new Date('2025-10-22'),
        businessDate: new Date('2025-10-22'),
        locationName: 'Senso Sushi',
        locationId: 'senso-frankfort',
        reportType: 'pmix' as const,
        metrics: [
          {
            metricName: 'net_sales' as const,
            metricValue: '$1,234.56',
            primaryCategory: '(Beer)',
            dimensions: {
              category: 'Bottle Beer',
              item_name: 'Budweiser',
            },
          },
        ],
        metadata: {
          pdfFilename: 'test.pdf',
          parsedBy: 'gemini',
          parsingVersion: '1.0',
        },
      };

      expect(() => parser.validateReport(report)).not.toThrow();
    });

    it('should throw error for report without metrics', () => {
      const report = {
        reportDate: new Date('2025-10-22'),
        businessDate: new Date('2025-10-22'),
        locationName: 'Senso Sushi',
        locationId: 'senso-frankfort',
        reportType: 'pmix' as const,
        metrics: [],
        metadata: {
          pdfFilename: 'test.pdf',
          parsedBy: 'gemini',
          parsingVersion: '1.0',
        },
      };

      expect(() => parser.validateReport(report)).toThrow('No metrics extracted from PDF');
    });
  });
});
