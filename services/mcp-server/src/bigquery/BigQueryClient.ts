// BigQuery Client Wrapper
// Provides safe access to BigQuery with parameterized queries

import { BigQuery } from '@google-cloud/bigquery';
import { config } from '../config/config';

export interface QueryResult {
  rows: any[];
  totalRows: number;
  executionTimeMs: number;
}

export class BigQueryClient {
  private client: BigQuery;

  constructor() {
    this.client = new BigQuery({
      projectId: config.projectId
    });
  }

  /**
   * Execute a query with timeout
   */
  async query(sqlQuery: string, params?: Record<string, any>): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      const options: any = {
        query: sqlQuery,
        location: config.region,
        timeoutMs: config.queryTimeoutMs
      };

      // Add parameters if provided
      if (params) {
        options.params = params;
      }

      const [job] = await this.client.createQueryJob(options);

      // Wait for query to complete with timeout
      const [rows] = await job.getQueryResults({
        timeoutMs: config.queryTimeoutMs
      });

      const executionTimeMs = Date.now() - startTime;

      return {
        rows,
        totalRows: rows.length,
        executionTimeMs
      };
    } catch (error: any) {
      // Handle timeout errors
      if (error.message?.includes('timeout') || error.code === 'DEADLINE_EXCEEDED') {
        throw new Error('QUERY_TIMEOUT: Query exceeded 30 second timeout');
      }

      // Handle other BigQuery errors
      throw new Error(`BigQuery error: ${error.message}`);
    }
  }

  /**
   * Call a stored procedure
   */
  async callProcedure(
    procedureName: string,
    params: Record<string, any>
  ): Promise<QueryResult> {
    const startTime = Date.now();

    try {
      // Build CALL statement with named parameters
      const paramNames = Object.keys(params);
      const paramPlaceholders = paramNames.map(name => `@${name}`).join(', ');

      const callStatement = `
        DECLARE result_table STRING;
        CALL \`${config.projectId}.${procedureName}\`(
          ${paramPlaceholders},
          result_table
        );
        -- Return results from temp table
        EXECUTE IMMEDIATE FORMAT('SELECT * FROM %s', result_table);
      `;

      // Build types for null parameters ONLY
      const paramTypes: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        if (value === null) {
          paramTypes[key] = this.inferParameterType(key);
        }
      }

      console.log(JSON.stringify({
        severity: 'INFO',
        message: 'Calling stored procedure',
        component: 'BigQueryClient',
        procedure: procedureName,
        params: params,
        paramTypes: paramTypes,
        paramNames: paramNames
      }));

      const options: any = {
        query: callStatement,
        location: config.region,
        timeoutMs: config.queryTimeoutMs,
        params: params
      };

      // Only add types if there are null parameters
      if (Object.keys(paramTypes).length > 0) {
        options.types = paramTypes;
      }

      const [job] = await this.client.createQueryJob(options);
      const [rows] = await job.getQueryResults({
        timeoutMs: config.queryTimeoutMs
      });

      const executionTimeMs = Date.now() - startTime;

      return {
        rows,
        totalRows: rows.length,
        executionTimeMs
      };
    } catch (error: any) {
      // Handle SIGNAL SQLSTATE errors from stored procedures
      if (error.message?.includes('SIGNAL SQLSTATE')) {
        const match = error.message.match(/MESSAGE_TEXT = '([^']+)'/);
        if (match) {
          throw new Error(match[1]);
        }
      }

      if (error.message?.includes('timeout') || error.code === 'DEADLINE_EXCEEDED') {
        throw new Error('QUERY_TIMEOUT: Query exceeded 30 second timeout');
      }

      throw new Error(`Stored procedure error: ${error.message}`);
    }
  }

  /**
   * Add type information to parameters for BigQuery
   * Required for null values
   */
  private addTypesToParams(params: Record<string, any>): Record<string, any> {
    const typedParams: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (value === null) {
        // Infer type from parameter name
        const type = this.inferParameterType(key);
        typedParams[key] = { value: null, type };
      } else {
        typedParams[key] = value;
      }
    }

    return typedParams;
  }

  /**
   * Infer BigQuery type from parameter name
   */
  private inferParameterType(paramName: string): string {
    const lower = paramName.toLowerCase();

    // Check most specific patterns first to avoid false matches
    // For dates, only match if 'date' is a distinct word or suffix
    if (lower.includes('_date') || lower.endsWith('date') || lower.startsWith('date_')) return 'DATE';

    // Check for integer patterns
    if (lower.includes('count') || lower.includes('limit') || lower.includes('max') || lower.includes('rows') || lower === 'days' || lower.includes('threshold')) return 'INT64';

    // Check for float patterns
    if (lower.includes('amount') || lower.includes('value') || lower.includes('price')) return 'FLOAT64';

    // Check for boolean patterns
    if (lower.includes('is_') || lower.includes('has_')) return 'BOOL';

    // Default to STRING for category, subcategory, item_name, aggregation, fields, etc.
    return 'STRING';
  }

  /**
   * Check if a table exists
   */
  async tableExists(dataset: string, tableName: string): Promise<boolean> {
    try {
      const table = this.client.dataset(dataset).table(tableName);
      const [exists] = await table.exists();
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Get distinct values from a column
   */
  async getDistinctValues(
    dataset: string,
    table: string,
    column: string,
    limit: number = 1000
  ): Promise<string[]> {
    const query = `
      SELECT DISTINCT ${column} as value
      FROM \`${config.projectId}.${dataset}.${table}\`
      WHERE ${column} IS NOT NULL
      ORDER BY ${column}
      LIMIT @limit
    `;

    const result = await this.query(query, { limit });
    return result.rows.map((row: any) => row.value);
  }
}
