/**
 * PMIX (Product Mix) PDF parser using Gemini
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { BaseParser } from './BaseParser';
import { ParsedReport, ParsedMetric } from '../types';

export class PmixParser extends BaseParser {
  private genAI: GoogleGenerativeAI | null = null;
  private model: string;
  private projectId: string;
  private geminiSecretName: string;

  constructor(projectId: string, geminiSecretName: string, model: string) {
    super();
    this.projectId = projectId;
    this.geminiSecretName = geminiSecretName;
    this.model = model;
  }

  /**
   * Initialize Gemini API client
   */
  async initialize(): Promise<void> {
    const apiKey = await this.loadGeminiApiKey();
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Load Gemini API key from Secret Manager
   */
  private async loadGeminiApiKey(): Promise<string> {
    const secretManager = new SecretManagerServiceClient({});
    const secretPath = `projects/${this.projectId}/secrets/${this.geminiSecretName}/versions/latest`;

    const [version] = await secretManager.accessSecretVersion({
      name: secretPath,
    });

    const payloadData = version.payload?.data;
    if (!payloadData) {
      throw new Error('Gemini API key secret is empty');
    }

    const apiKey = typeof payloadData === 'string'
      ? payloadData
      : Buffer.from(payloadData as Uint8Array).toString('utf8');

    return apiKey;
  }

  canParse(filename: string, subject: string): boolean {
    const lowerFilename = filename.toLowerCase();
    const lowerSubject = subject.toLowerCase();

    return (
      lowerFilename.includes('pmix') ||
      lowerFilename.includes('product mix') ||
      lowerSubject.includes('pmix') ||
      lowerSubject.includes('product mix')
    );
  }

  getReportType(): 'pmix' | 'labor' | 'unknown' {
    return 'pmix';
  }

  /**
   * Parse PMIX PDF using Gemini
   */
  async parse(
    pdfBuffer: Buffer,
    metadata: { filename: string; emailDate: Date }
  ): Promise<ParsedReport> {
    if (!this.genAI) {
      await this.initialize();
    }

    if (!this.genAI) {
      throw new Error('Gemini API not initialized');
    }

    const model = this.genAI.getGenerativeModel({ model: this.model });

    // Convert PDF to base64
    const pdfBase64 = pdfBuffer.toString('base64');

    const prompt = this.buildPmixPrompt();

    console.log(`Parsing PMIX PDF with Gemini (${this.model})...`);

    try {
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBase64,
          },
        },
        { text: prompt },
      ]);

      const response = result.response;
      const text = response.text();

      // Parse JSON response
      const parsed = this.parseGeminiResponse(text);

      // Validate and transform
      return this.transformToReport(parsed, metadata);
    } catch (error) {
      console.error('Gemini parsing failed:', error);
      throw new Error(`Failed to parse PMIX PDF: ${error}`);
    }
  }

  /**
   * Build comprehensive prompt for PMIX extraction
   */
  private buildPmixPrompt(): string {
    return `Extract ALL sales data from this Product Mix (PMIX) report PDF.

CRITICAL RULES:
1. Primary categories ALWAYS have parentheses: "(Beer)", "(Sushi)", "(Food)", "(Wine)", "(Liquor)", "(N/A Beverages)"
2. Subcategories NEVER have parentheses: "Bottle Beer", "Draft Beer", "Signature Rolls", etc.
3. Extract BOTH "Net Sales" AND "Quantity Sold" for each item
4. Keep dollar amounts as strings with "$" and commas (e.g., "$1,234.56")
5. Extract report date and business date
6. Extract location name

OUTPUT FORMAT (JSON only, no markdown):
{
  "report_date": "YYYY-MM-DD",
  "business_date": "YYYY-MM-DD",
  "location_name": "Location Name",
  "location_id": "location-identifier",
  "metrics": [
    {
      "metric_name": "net_sales",
      "metric_value": "$1,234.56",
      "primary_category": "(Beer)",
      "dimensions": {
        "category": "Bottle Beer",
        "item_name": "Budweiser",
        "price": "$5.00"
      }
    },
    {
      "metric_name": "quantity_sold",
      "metric_value": "25",
      "primary_category": "(Beer)",
      "dimensions": {
        "category": "Bottle Beer",
        "item_name": "Budweiser"
      }
    }
  ]
}

IMPORTANT:
- Include ALL items from the report
- For each item, create TWO metrics: one for net_sales and one for quantity_sold
- Preserve exact category names from the PDF
- Return ONLY valid JSON, no explanatory text`;
  }

  /**
   * Parse Gemini response (handles markdown code blocks)
   */
  private parseGeminiResponse(text: string): any {
    // Remove markdown code blocks if present
    let jsonText = text.trim();

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/g, '').replace(/```\n?$/g, '');
    }

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Failed to parse Gemini response as JSON:', jsonText);
      throw new Error('Invalid JSON response from Gemini');
    }
  }

  /**
   * Transform Gemini response to ParsedReport format
   */
  private transformToReport(
    geminiData: any,
    metadata: { filename: string; emailDate: Date }
  ): ParsedReport {
    // Validate required fields
    if (!geminiData.report_date || !geminiData.metrics) {
      throw new Error('Missing required fields in Gemini response');
    }

    // Parse dates
    const reportDate = new Date(geminiData.report_date);
    const businessDate = geminiData.business_date
      ? new Date(geminiData.business_date)
      : reportDate;

    // Transform metrics
    const metrics: ParsedMetric[] = geminiData.metrics.map((m: any) => ({
      metricName: m.metric_name as 'net_sales' | 'quantity_sold',
      metricValue: m.metric_value,
      primaryCategory: m.primary_category,
      dimensions: {
        category: m.dimensions?.category,
        item_name: m.dimensions?.item_name,
        price: m.dimensions?.price,
        modifiers: m.dimensions?.modifiers || [],
      },
    }));

    return {
      reportDate,
      businessDate,
      locationName: geminiData.location_name || 'Unknown',
      locationId: geminiData.location_id || 'unknown',
      reportType: 'pmix',
      metrics,
      metadata: {
        pdfFilename: metadata.filename,
        parsedBy: this.model,
        parsingVersion: '1.0',
      },
    };
  }

  /**
   * Validate parsed report data
   */
  validateReport(report: ParsedReport): void {
    if (report.metrics.length === 0) {
      throw new Error('No metrics extracted from PDF');
    }

    // Check for invalid metric values
    for (const metric of report.metrics) {
      if (!metric.metricValue || metric.metricValue === '') {
        throw new Error('Invalid metric value: empty');
      }

      if (!metric.primaryCategory) {
        throw new Error('Missing primary category');
      }

      // Validate primary category has parentheses
      if (
        !metric.primaryCategory.startsWith('(') ||
        !metric.primaryCategory.endsWith(')')
      ) {
        console.warn(
          `Primary category missing parentheses: ${metric.primaryCategory}`
        );
      }

      // Validate subcategory does NOT have parentheses
      if (metric.dimensions.category) {
        if (
          metric.dimensions.category.startsWith('(') &&
          metric.dimensions.category.endsWith(')')
        ) {
          console.warn(
            `Subcategory should not have parentheses: ${metric.dimensions.category}`
          );
        }
      }
    }
  }
}
