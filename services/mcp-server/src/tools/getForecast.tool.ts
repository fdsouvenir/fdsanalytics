// Get Forecast Tool
// Provides 7-day sales forecasting

import { BigQueryClient } from '../bigquery/BigQueryClient';
import { GetForecastParams, GetForecastParamsSchema } from '../schemas/paramSchemas';
import { config } from '../config/config';

export interface ForecastResult {
  forecasts: Array<{
    targetDate: string;
    dayOfWeek: number;
    dayName: string;
    predictedSales: number;
    confidenceLow: number;
    confidenceHigh: number;
    confidenceScore: number;
    modelVersion: string;
    historicalSamples: number;
  }>;
  totalRows: number;
  executionTimeMs: number;
  metadata: {
    daysForecasted: number;
    generatedAt: string;
  };
}

export class GetForecastTool {
  private bqClient: BigQueryClient;

  constructor(bqClient: BigQueryClient) {
    this.bqClient = bqClient;
  }

  async execute(params: any): Promise<ForecastResult> {
    const startTime = Date.now();

    // Validate schema
    const validatedParams = GetForecastParamsSchema.parse(params);

    // Call stored procedure
    try {
      const result = await this.bqClient.callProcedure(
        `${config.bqDatasetInsights}.get_forecast`,
        {
          days: validatedParams.days
        }
      );

      const executionTimeMs = Date.now() - startTime;

      return {
        forecasts: result.rows.map((row: any) => ({
          targetDate: row.target_date,
          dayOfWeek: row.day_of_week,
          dayName: row.day_name,
          predictedSales: parseFloat(row.predicted_sales),
          confidenceLow: parseFloat(row.confidence_low),
          confidenceHigh: parseFloat(row.confidence_high),
          confidenceScore: parseFloat(row.confidence_score),
          modelVersion: row.model_version,
          historicalSamples: parseInt(row.historical_samples, 10)
        })),
        totalRows: result.totalRows,
        executionTimeMs,
        metadata: {
          daysForecasted: validatedParams.days,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error: any) {
      throw new Error(`Forecast generation failed: ${error.message}`);
    }
  }
}
