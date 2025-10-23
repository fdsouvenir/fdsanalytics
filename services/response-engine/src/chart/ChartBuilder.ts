interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
}

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'horizontalBar';
  title: string;
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
  options?: {
    scales?: any;
    plugins?: any;
  };
}

/**
 * ChartBuilder - Generate charts using quickchart.io
 *
 * Features:
 * - Bar, line, pie, horizontal bar charts
 * - URL generation for quickchart.io
 * - Fallback to null on failure (graceful degradation)
 * - Circuit breaker pattern (after 5 failures, stop trying for 1 minute)
 */
export class ChartBuilder {
  private static readonly QUICKCHART_BASE_URL = 'https://quickchart.io/chart';
  private static readonly DEFAULT_COLORS = [
    '#4285F4', // Google Blue
    '#34A853', // Google Green
    '#FBBC05', // Google Yellow
    '#EA4335', // Google Red
    '#9C27B0', // Purple
    '#00BCD4'  // Cyan
  ];

  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private readonly circuitBreakerThreshold = 5;
  private readonly circuitBreakerResetMs = 60000; // 1 minute

  /**
   * Generate quickchart.io URL from chart spec
   * Returns null if generation fails (for fallback)
   */
  async generateChartUrl(spec: ChartSpec): Promise<string | null> {
    // Check circuit breaker
    if (this.isCircuitBreakerOpen()) {
      console.warn('Chart generation circuit breaker is open, skipping chart');
      return null;
    }

    try {
      // Validate spec
      this.validateSpec(spec);

      // Build Chart.js config
      const chartConfig = this.buildChartConfig(spec);

      // Encode for URL
      const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));

      // Build URL
      const url = `${ChartBuilder.QUICKCHART_BASE_URL}?c=${encodedConfig}&width=600&height=400`;

      // Test if URL is too long (quickchart limit is ~16k chars)
      if (url.length > 15000) {
        console.warn('Chart URL too long, skipping chart', {
          urlLength: url.length,
          dataPoints: spec.data.labels.length
        });
        return null;
      }

      // Reset failure count on success
      this.failureCount = 0;
      this.lastFailureTime = null;

      return url;
    } catch (error: any) {
      console.error('Failed to generate chart URL', {
        error: error.message,
        spec: spec.type
      });

      // Increment failure count
      this.failureCount++;
      this.lastFailureTime = Date.now();

      return null; // Graceful degradation
    }
  }

  /**
   * Build Chart.js configuration object
   */
  private buildChartConfig(spec: ChartSpec): any {
    // Assign colors if not provided
    const datasets = spec.data.datasets.map((dataset, index) => {
      if (!dataset.backgroundColor) {
        if (spec.type === 'pie') {
          // Pie charts need array of colors
          dataset.backgroundColor = ChartBuilder.DEFAULT_COLORS.slice(0, spec.data.labels.length);
        } else {
          // Bar/line charts use single color per dataset
          dataset.backgroundColor = ChartBuilder.DEFAULT_COLORS[index % ChartBuilder.DEFAULT_COLORS.length];
        }
      }
      return dataset;
    });

    const config: any = {
      type: spec.type === 'horizontalBar' ? 'horizontalBar' : spec.type,
      data: {
        labels: spec.data.labels,
        datasets
      },
      options: {
        plugins: {
          title: {
            display: true,
            text: spec.title,
            font: {
              size: 16
            }
          },
          legend: {
            display: spec.data.datasets.length > 1 || spec.type === 'pie'
          }
        },
        scales: spec.type !== 'pie' ? {
          y: {
            beginAtZero: true
          }
        } : undefined,
        ...spec.options
      }
    };

    return config;
  }

  /**
   * Validate chart spec
   */
  private validateSpec(spec: ChartSpec): void {
    if (!spec.type) {
      throw new Error('Chart type is required');
    }

    if (!spec.data || !spec.data.labels || spec.data.labels.length === 0) {
      throw new Error('Chart data labels are required');
    }

    if (!spec.data.datasets || spec.data.datasets.length === 0) {
      throw new Error('Chart datasets are required');
    }

    // Check data consistency
    for (const dataset of spec.data.datasets) {
      if (dataset.data.length !== spec.data.labels.length) {
        throw new Error('Dataset data length must match labels length');
      }
    }

    // Check max datapoints (prevent URL from being too long)
    if (spec.data.labels.length > 20) {
      throw new Error('Maximum 20 data points allowed for charts');
    }
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.failureCount < this.circuitBreakerThreshold) {
      return false;
    }

    // Check if enough time has passed to try again
    if (this.lastFailureTime && Date.now() - this.lastFailureTime > this.circuitBreakerResetMs) {
      // Reset circuit breaker
      this.failureCount = 0;
      this.lastFailureTime = null;
      return false;
    }

    return true;
  }

  /**
   * Create sample bar chart (for testing)
   */
  static createSampleBarChart(title: string, labels: string[], values: number[]): ChartSpec {
    return {
      type: 'bar',
      title,
      data: {
        labels,
        datasets: [
          {
            label: 'Sales',
            data: values
          }
        ]
      }
    };
  }

  /**
   * Create sample line chart (for trends)
   */
  static createSampleLineChart(title: string, labels: string[], values: number[]): ChartSpec {
    return {
      type: 'line',
      title,
      data: {
        labels,
        datasets: [
          {
            label: 'Trend',
            data: values,
            borderColor: '#4285F4',
            borderWidth: 2
          }
        ]
      }
    };
  }
}
