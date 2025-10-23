/**
 * BigQuery client with MERGE upsert pattern for idempotent ingestion
 */

import { BigQuery } from '@google-cloud/bigquery';
import { ParsedReport, ReportRow, MetricRow } from '../types';

export class BigQueryClient {
  private bq: BigQuery;
  private projectId: string;
  private analyticsDataset: string;

  constructor(projectId: string, analyticsDataset: string) {
    this.bq = new BigQuery({ projectId });
    this.projectId = projectId;
    this.analyticsDataset = analyticsDataset;
  }

  /**
   * Upsert report using MERGE pattern (idempotent)
   */
  async upsertReport(report: ParsedReport): Promise<{ reportId: string; rowsInserted: number }> {
    const reportId = this.generateReportId(report);

    // Prepare report row
    const reportRow = this.buildReportRow(report, reportId);

    // Prepare metrics rows
    const metricRows = this.buildMetricRows(report, reportId);

    console.log(
      `Upserting report ${reportId} with ${metricRows.length} metrics`
    );

    // Use MERGE for reports table
    await this.mergeReport(reportRow);

    // Use MERGE for metrics table
    await this.mergeMetrics(metricRows);

    return {
      reportId,
      rowsInserted: metricRows.length,
    };
  }

  /**
   * MERGE report into reports table (prevents duplicates)
   */
  private async mergeReport(reportRow: ReportRow): Promise<void> {
    const query = `
      MERGE \`${this.projectId}.${this.analyticsDataset}.reports\` T
      USING (
        SELECT
          @report_id AS report_id,
          DATE(@report_date) AS report_date,
          DATE(@business_date) AS business_date,
          CURRENT_TIMESTAMP() AS created_at,
          @pdf_filename AS pdf_filename,
          @report_type AS report_type,
          @location_name AS location_name,
          @location_id AS location_id,
          @parsed_by AS parsed_by,
          @parsing_version AS parsing_version
      ) S
      ON T.report_id = S.report_id
      WHEN MATCHED THEN
        UPDATE SET
          report_date = S.report_date,
          business_date = S.business_date,
          pdf_filename = S.pdf_filename,
          location_name = S.location_name,
          location_id = S.location_id,
          parsed_by = S.parsed_by,
          parsing_version = S.parsing_version
      WHEN NOT MATCHED THEN
        INSERT (
          report_id,
          report_date,
          business_date,
          created_at,
          pdf_filename,
          report_type,
          location_name,
          location_id,
          parsed_by,
          parsing_version
        )
        VALUES (
          S.report_id,
          S.report_date,
          S.business_date,
          S.created_at,
          S.pdf_filename,
          S.report_type,
          S.location_name,
          S.location_id,
          S.parsed_by,
          S.parsing_version
        )
    `;

    const options = {
      query,
      params: {
        report_id: reportRow.report_id,
        report_date: reportRow.report_date,
        business_date: reportRow.business_date,
        pdf_filename: reportRow.pdf_filename,
        report_type: reportRow.report_type,
        location_name: reportRow.location_name,
        location_id: reportRow.location_id,
        parsed_by: reportRow.parsed_by,
        parsing_version: reportRow.parsing_version,
      },
    };

    await this.bq.query(options);
    console.log(`Merged report: ${reportRow.report_id}`);
  }

  /**
   * MERGE metrics (delete old, insert new)
   */
  private async mergeMetrics(metricRows: MetricRow[]): Promise<void> {
    if (metricRows.length === 0) {
      console.warn('No metrics to insert');
      return;
    }

    const reportId = metricRows[0].report_id;

    // First, delete existing metrics for this report
    const deleteQuery = `
      DELETE FROM \`${this.projectId}.${this.analyticsDataset}.metrics\`
      WHERE report_id = @report_id
    `;

    await this.bq.query({
      query: deleteQuery,
      params: { report_id: reportId },
    });

    console.log(`Deleted existing metrics for report ${reportId}`);

    // Then insert all new metrics
    const table = this.bq
      .dataset(this.analyticsDataset)
      .table('metrics');

    // Transform to BigQuery format
    const rows = metricRows.map((row) => ({
      metric_id: row.metric_id,
      report_id: row.report_id,
      metric_name: row.metric_name,
      metric_value: row.metric_value,
      primary_category: row.primary_category,
      dimensions: row.dimensions, // Already JSON string
      created_at: row.created_at,
    }));

    await table.insert(rows);
    console.log(`Inserted ${rows.length} metrics for report ${reportId}`);
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(report: ParsedReport): string {
    const dateStr = report.reportDate.toISOString().split('T')[0];
    const locationId = report.locationId.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `${dateStr}-${report.reportType}-${locationId}`;
  }

  /**
   * Build report row for BigQuery
   */
  private buildReportRow(report: ParsedReport, reportId: string): ReportRow {
    const reportDate = report.reportDate.toISOString().split('T')[0];
    const businessDate = report.businessDate.toISOString().split('T')[0];

    return {
      report_id: reportId,
      report_date: reportDate,
      business_date: businessDate,
      created_at: new Date().toISOString(),
      pdf_filename: report.metadata.pdfFilename,
      report_type: report.reportType,
      location_name: report.locationName,
      location_id: report.locationId,
      parsed_by: report.metadata.parsedBy,
      parsing_version: report.metadata.parsingVersion,
    };
  }

  /**
   * Build metric rows for BigQuery
   */
  private buildMetricRows(report: ParsedReport, reportId: string): MetricRow[] {
    const createdAt = new Date().toISOString();

    return report.metrics.map((metric, index) => {
      const metricId = `${reportId}-${String(index + 1).padStart(4, '0')}`;

      return {
        metric_id: metricId,
        report_id: reportId,
        metric_name: metric.metricName,
        metric_value: metric.metricValue,
        primary_category: metric.primaryCategory,
        dimensions: JSON.stringify(metric.dimensions),
        created_at: createdAt,
      };
    });
  }

  /**
   * Query to check if report already exists
   */
  async reportExists(reportId: string): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM \`${this.projectId}.${this.analyticsDataset}.reports\`
      WHERE report_id = @report_id
    `;

    const [rows] = await this.bq.query({
      query,
      params: { report_id: reportId },
    });

    return rows[0].count > 0;
  }
}
