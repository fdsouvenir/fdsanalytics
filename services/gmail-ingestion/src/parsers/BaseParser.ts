/**
 * Base parser interface for different report types
 */

import { ParsedReport } from '../types';

export abstract class BaseParser {
  /**
   * Detect if this parser can handle the given PDF
   */
  abstract canParse(filename: string, subject: string): boolean;

  /**
   * Parse PDF buffer into structured data
   */
  abstract parse(
    pdfBuffer: Buffer,
    metadata: { filename: string; emailDate: Date }
  ): Promise<ParsedReport>;

  /**
   * Get report type identifier
   */
  abstract getReportType(): 'pmix' | 'labor' | 'unknown';
}
