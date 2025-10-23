// Get Anomalies Tool
// Detects anomalies in sales data

import { BigQueryClient } from '../bigquery/BigQueryClient';
import { GetAnomaliesParams, GetAnomaliesParamsSchema } from '../schemas/paramSchemas';
import { config } from '../config/config';

export interface AnomaliesResult {
  anomalies: Array<{
    date: string;
    metric: string;
    currentValue: number;
    expectedValue: number;
    changeAmount: number;
    percentChange: number;
    anomalyType: 'spike' | 'drop';
    severity: 'minor' | 'major';
    detectionMethod: string;
  }>;
  totalRows: number;
  executionTimeMs: number;
  metadata: {
    daysChecked: number;
    thresholds: {
      minor: string;
      major: string;
    };
    generatedAt: string;
  };
}

export class GetAnomaliesTool {
  private bqClient: BigQueryClient;

  constructor(bqClient: BigQueryClient) {
    this.bqClient = bqClient;
  }

  async execute(params: any): Promise<AnomaliesResult> {
    const startTime = Date.now();

    // Validate schema
    const validatedParams = GetAnomaliesParamsSchema.parse(params);

    // Call stored procedure
    try {
      const result = await this.bqClient.callProcedure(
        `${config.bqDatasetInsights}.get_anomalies`,
        {
          days_back: validatedParams.days
        }
      );

      const executionTimeMs = Date.now() - startTime;

      return {
        anomalies: result.rows.map((row: any) => ({
          date: row.date,
          metric: row.metric,
          currentValue: parseFloat(row.current_value),
          expectedValue: parseFloat(row.expected_value),
          changeAmount: parseFloat(row.change_amount),
          percentChange: parseFloat(row.percent_change),
          anomalyType: row.anomaly_type as 'spike' | 'drop',
          severity: row.severity as 'minor' | 'major',
          detectionMethod: row.detection_method
        })),
        totalRows: result.totalRows,
        executionTimeMs,
        metadata: {
          daysChecked: validatedParams.days,
          thresholds: {
            minor: '±40%',
            major: '±60%'
          },
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error: any) {
      throw new Error(`Anomaly detection failed: ${error.message}`);
    }
  }
}
