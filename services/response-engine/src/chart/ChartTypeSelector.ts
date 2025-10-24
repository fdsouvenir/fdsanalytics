// Chart Type Selector
// Uses Gemini to intelligently select the best chart type based on data

import { GeminiClient } from '../clients/GeminiClient';
import { ChartType, CHART_TYPE_METADATA, ChartTypeMetadata } from './chartTypes';

export interface DataAnalysis {
  rowCount: number;
  hasDateField: boolean;
  hasCategoryField: boolean;
  hasNumericField: boolean;
  datasetCount: number;
  labelField?: string;
  valueFields: string[];
  sampleData: any[];
}

export class ChartTypeSelector {
  constructor(private geminiClient: GeminiClient) {}

  /**
   * Select the best chart type using Gemini
   */
  async selectChartType(
    data: any[],
    toolName: string,
    userMessage?: string
  ): Promise<ChartType> {
    if (!data || data.length === 0) {
      return 'bar';  // Default fallback
    }

    // Analyze data structure
    const analysis = this.analyzeData(data);

    // Use rule-based selection for simple cases (faster)
    const ruleBasedType = this.ruleBasedSelection(analysis);
    if (ruleBasedType && this.isHighConfidence(analysis, ruleBasedType)) {
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Chart type selected (rule-based)',
        chartType: ruleBasedType,
        dataAnalysis: analysis
      }));
      return ruleBasedType;
    }

    // Use Gemini for complex cases
    try {
      const geminiType = await this.geminiBasedSelection(analysis, toolName, userMessage);
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Chart type selected (Gemini)',
        chartType: geminiType,
        dataAnalysis: analysis
      }));
      return geminiType;
    } catch (error: any) {
      console.error('Gemini chart selection failed, using rule-based fallback', {
        error: error.message
      });
      return ruleBasedType || 'bar';
    }
  }

  /**
   * Analyze data structure
   */
  private analyzeData(data: any[]): DataAnalysis {
    const firstRow = data[0];
    const fields = Object.keys(firstRow);

    // Detect field types
    const hasDateField = fields.some(f =>
      f.includes('date') ||
      f.includes('time') ||
      f.includes('month') ||
      f.includes('year') ||
      this.looksLikeDate(firstRow[f])
    );

    const hasCategoryField = fields.some(f =>
      f.includes('category') ||
      f.includes('name') ||
      f.includes('label') ||
      typeof firstRow[f] === 'string'
    );

    const numericFields = fields.filter(f =>
      typeof firstRow[f] === 'number' ||
      !isNaN(parseFloat(firstRow[f]))
    );

    // Identify label and value fields
    let labelField: string | undefined;
    if (hasDateField) {
      labelField = fields.find(f => f.includes('date') || f.includes('time'));
    } else if (hasCategoryField) {
      labelField = fields.find(f =>
        f.includes('category') || f.includes('name') || typeof firstRow[f] === 'string'
      );
    }

    return {
      rowCount: data.length,
      hasDateField,
      hasCategoryField,
      hasNumericField: numericFields.length > 0,
      datasetCount: numericFields.length,
      labelField,
      valueFields: numericFields,
      sampleData: data.slice(0, 3)
    };
  }

  /**
   * Rule-based chart type selection
   */
  private ruleBasedSelection(analysis: DataAnalysis): ChartType | null {
    const { rowCount, hasDateField, hasCategoryField, datasetCount } = analysis;

    // Time series → line chart
    if (hasDateField && rowCount >= 3) {
      return datasetCount > 1 ? 'mixed' : 'line';
    }

    // Small categorical data → pie/doughnut
    if (hasCategoryField && rowCount <= 6 && rowCount >= 2 && datasetCount === 1) {
      return 'doughnut';
    }

    // Large categorical data → horizontal bar (better for long labels)
    if (hasCategoryField && rowCount > 10) {
      return 'horizontalBar';
    }

    // Medium categorical data → vertical bar
    if (hasCategoryField && rowCount >= 2 && rowCount <= 20) {
      return datasetCount > 1 ? 'bar' : 'bar';
    }

    return null;  // No high-confidence rule match
  }

  /**
   * Check if rule-based selection is high confidence
   */
  private isHighConfidence(analysis: DataAnalysis, chartType: ChartType): boolean {
    const metadata = CHART_TYPE_METADATA[chartType];

    // Check row count is within recommended range
    if (metadata.maxDataPoints && analysis.rowCount > metadata.maxDataPoints) {
      return false;
    }
    if (metadata.minDataPoints && analysis.rowCount < metadata.minDataPoints) {
      return false;
    }

    // Check data type compatibility
    if (metadata.supportsTimeSeries && analysis.hasDateField) {
      return true;  // High confidence for time series
    }
    if (metadata.supportsCategorical && analysis.hasCategoryField) {
      return true;  // High confidence for categorical
    }

    return false;
  }

  /**
   * Use Gemini to select chart type
   */
  private async geminiBasedSelection(
    analysis: DataAnalysis,
    toolName: string,
    userMessage?: string
  ): Promise<ChartType> {
    const prompt = this.buildGeminiPrompt(analysis, toolName, userMessage);

    const response = await this.geminiClient.generateResponse({
      userMessage: prompt,
      context: ''
    });

    const chartType = this.parseChartType(response.text || '');
    return chartType;
  }

  /**
   * Build prompt for Gemini
   */
  private buildGeminiPrompt(
    analysis: DataAnalysis,
    toolName: string,
    userMessage?: string
  ): string {
    const parts: string[] = [];

    parts.push('You are a data visualization expert. Select the best chart type for this data.');
    parts.push('');
    parts.push('Data Analysis:');
    parts.push(`- Row count: ${analysis.rowCount}`);
    parts.push(`- Has date/time field: ${analysis.hasDateField ? 'YES' : 'NO'}`);
    parts.push(`- Has categorical field: ${analysis.hasCategoryField ? 'YES' : 'NO'}`);
    parts.push(`- Number of numeric fields: ${analysis.datasetCount}`);
    if (analysis.labelField) {
      parts.push(`- Label field: ${analysis.labelField}`);
    }
    parts.push(`- Value fields: ${analysis.valueFields.join(', ')}`);

    if (userMessage) {
      parts.push('');
      parts.push(`User\'s original question: "${userMessage}"`);
    }

    parts.push('');
    parts.push(`Tool used: ${toolName}`);

    parts.push('');
    parts.push('Sample data (first 3 rows):');
    parts.push(JSON.stringify(analysis.sampleData, null, 2));

    parts.push('');
    parts.push('Available chart types:');
    Object.entries(CHART_TYPE_METADATA).forEach(([type, meta]) => {
      if (this.isChartTypeApplicable(analysis, meta)) {
        parts.push(`- ${type}: ${meta.description}`);
        parts.push(`  Best for: ${meta.bestFor.join(', ')}`);
        if (meta.maxDataPoints) {
          parts.push(`  Max data points: ${meta.maxDataPoints}`);
        }
      }
    });

    parts.push('');
    parts.push('Guidelines:');
    parts.push('- For time series (dates): prefer "line" or "area"');
    parts.push('- For rankings (top/bottom N): prefer "horizontalBar"');
    parts.push('- For category comparison: prefer "bar"');
    parts.push('- For part-to-whole (2-6 items): prefer "doughnut" or "pie"');
    parts.push('- For multiple metrics: prefer "mixed"');
    parts.push('- For trends over time with multiple series: prefer "line"');

    parts.push('');
    parts.push('Return ONLY the chart type name (e.g., "bar", "line", "doughnut", "horizontalBar").');
    parts.push('Do not include any explanation, just the chart type name.');

    return parts.join('\n');
  }

  /**
   * Check if chart type is applicable to data
   */
  private isChartTypeApplicable(analysis: DataAnalysis, metadata: ChartTypeMetadata): boolean {
    // Check row count constraints
    if (metadata.maxDataPoints && analysis.rowCount > metadata.maxDataPoints) {
      return false;
    }
    if (metadata.minDataPoints && analysis.rowCount < metadata.minDataPoints) {
      return false;
    }

    // Check data type compatibility
    if (!analysis.hasNumericField && metadata.requiresNumericData) {
      return false;
    }

    if (analysis.hasDateField && !metadata.supportsTimeSeries) {
      return false;
    }

    if (!analysis.hasCategoryField && !metadata.supportsCategorical && !metadata.supportsTimeSeries) {
      return false;
    }

    if (analysis.datasetCount > 1 && !metadata.supportsMultipleDatasets) {
      return false;
    }

    return true;
  }

  /**
   * Parse chart type from Gemini response
   */
  private parseChartType(text: string): ChartType {
    const normalized = text.toLowerCase().trim();

    // Direct matches
    const validTypes: ChartType[] = [
      'bar', 'horizontalBar', 'line', 'area', 'pie', 'doughnut',
      'radar', 'scatter', 'bubble', 'polarArea', 'mixed'
    ];

    for (const type of validTypes) {
      if (normalized.includes(type.toLowerCase())) {
        return type;
      }
    }

    // Fuzzy matches
    if (normalized.includes('horizontal')) return 'horizontalBar';
    if (normalized.includes('donut')) return 'doughnut';
    if (normalized.includes('polar')) return 'polarArea';

    // Default fallback
    console.warn('Could not parse chart type from Gemini response:', text);
    return 'bar';
  }

  /**
   * Check if value looks like a date
   */
  private looksLikeDate(value: any): boolean {
    if (typeof value !== 'string') return false;

    // Check for common date formats
    const datePatterns = [
      /^\d{4}-\d{2}-\d{2}$/,  // YYYY-MM-DD
      /^\d{2}\/\d{2}\/\d{4}$/,  // MM/DD/YYYY
      /^\d{4}\/\d{2}\/\d{2}$/,  // YYYY/MM/DD
    ];

    return datePatterns.some(pattern => pattern.test(value));
  }
}
