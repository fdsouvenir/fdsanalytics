// Chart Type Definitions
// All chart types available from quickchart.io

export type ChartType =
  | 'bar'            // Vertical bar chart
  | 'horizontalBar'  // Horizontal bar chart
  | 'line'           // Line chart
  | 'area'           // Area chart (filled line)
  | 'pie'            // Pie chart
  | 'doughnut'       // Doughnut chart (pie with center hole)
  | 'radar'          // Radar/spider chart
  | 'scatter'        // Scatter plot
  | 'bubble'         // Bubble chart
  | 'polarArea'      // Polar area chart
  | 'mixed';         // Mixed chart (bar + line combination)

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string;
  borderWidth?: number;
  fill?: boolean;
  type?: ChartType;  // For mixed charts
  yAxisID?: string;  // For multi-axis charts
  pointRadius?: number;
  pointBackgroundColor?: string | string[];
}

export interface ChartSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
  options?: {
    scales?: any;
    plugins?: any;
    legend?: any;
    tooltips?: any;
  };
}

/**
 * Chart type metadata for selection logic
 */
export interface ChartTypeMetadata {
  type: ChartType;
  name: string;
  description: string;
  bestFor: string[];
  maxDataPoints?: number;  // Recommended max
  minDataPoints?: number;  // Recommended min
  requiresNumericData: boolean;
  supportsCategorical: boolean;
  supportsTimeSeries: boolean;
  supportsMultipleDatasets: boolean;
}

export const CHART_TYPE_METADATA: Record<ChartType, ChartTypeMetadata> = {
  bar: {
    type: 'bar',
    name: 'Vertical Bar Chart',
    description: 'Vertical bars for categorical comparisons',
    bestFor: ['Comparing categories', 'Ranking items', 'Period comparisons'],
    maxDataPoints: 20,
    minDataPoints: 2,
    requiresNumericData: true,
    supportsCategorical: true,
    supportsTimeSeries: true,
    supportsMultipleDatasets: true
  },
  horizontalBar: {
    type: 'horizontalBar',
    name: 'Horizontal Bar Chart',
    description: 'Horizontal bars for rankings and long labels',
    bestFor: ['Rankings (top/bottom N)', 'Long category names', 'Ordered lists'],
    maxDataPoints: 15,
    minDataPoints: 2,
    requiresNumericData: true,
    supportsCategorical: true,
    supportsTimeSeries: false,
    supportsMultipleDatasets: true
  },
  line: {
    type: 'line',
    name: 'Line Chart',
    description: 'Connected points showing trends over time',
    bestFor: ['Time series', 'Trends', 'Continuous data'],
    maxDataPoints: 30,
    minDataPoints: 3,
    requiresNumericData: true,
    supportsCategorical: false,
    supportsTimeSeries: true,
    supportsMultipleDatasets: true
  },
  area: {
    type: 'area',
    name: 'Area Chart',
    description: 'Filled line chart showing cumulative trends',
    bestFor: ['Cumulative trends', 'Part-to-whole over time', 'Volume visualization'],
    maxDataPoints: 30,
    minDataPoints: 3,
    requiresNumericData: true,
    supportsCategorical: false,
    supportsTimeSeries: true,
    supportsMultipleDatasets: true
  },
  pie: {
    type: 'pie',
    name: 'Pie Chart',
    description: 'Circular chart showing part-to-whole relationships',
    bestFor: ['Percentage breakdown', 'Market share', 'Category composition'],
    maxDataPoints: 6,
    minDataPoints: 2,
    requiresNumericData: true,
    supportsCategorical: true,
    supportsTimeSeries: false,
    supportsMultipleDatasets: false
  },
  doughnut: {
    type: 'doughnut',
    name: 'Doughnut Chart',
    description: 'Pie chart with center hole for additional labeling',
    bestFor: ['Percentage breakdown with total', 'Category composition', 'Focus on proportions'],
    maxDataPoints: 6,
    minDataPoints: 2,
    requiresNumericData: true,
    supportsCategorical: true,
    supportsTimeSeries: false,
    supportsMultipleDatasets: false
  },
  radar: {
    type: 'radar',
    name: 'Radar Chart',
    description: 'Multi-dimensional data on radial axes',
    bestFor: ['Multi-dimensional comparison', 'Performance metrics', 'Skill assessment'],
    maxDataPoints: 8,
    minDataPoints: 3,
    requiresNumericData: true,
    supportsCategorical: true,
    supportsTimeSeries: false,
    supportsMultipleDatasets: true
  },
  scatter: {
    type: 'scatter',
    name: 'Scatter Plot',
    description: 'Individual points showing correlation between two variables',
    bestFor: ['Correlation analysis', 'Distribution patterns', 'Outlier detection'],
    requiresNumericData: true,
    supportsCategorical: false,
    supportsTimeSeries: false,
    supportsMultipleDatasets: true
  },
  bubble: {
    type: 'bubble',
    name: 'Bubble Chart',
    description: 'Scatter plot with sized bubbles for 3-dimensional data',
    bestFor: ['Three-variable analysis', 'Size-weighted comparison', 'Portfolio analysis'],
    requiresNumericData: true,
    supportsCategorical: false,
    supportsTimeSeries: false,
    supportsMultipleDatasets: true
  },
  polarArea: {
    type: 'polarArea',
    name: 'Polar Area Chart',
    description: 'Circular chart with varying radius segments',
    bestFor: ['Cyclical data', 'Directional analysis', 'Seasonal patterns'],
    maxDataPoints: 12,
    minDataPoints: 3,
    requiresNumericData: true,
    supportsCategorical: true,
    supportsTimeSeries: false,
    supportsMultipleDatasets: false
  },
  mixed: {
    type: 'mixed',
    name: 'Mixed Chart',
    description: 'Combination of bar and line charts',
    bestFor: ['Multiple metrics', 'Comparisons with trends', 'Actual vs target'],
    maxDataPoints: 20,
    minDataPoints: 2,
    requiresNumericData: true,
    supportsCategorical: true,
    supportsTimeSeries: true,
    supportsMultipleDatasets: true
  }
};

/**
 * Color palettes for charts
 */
export const COLOR_PALETTES = {
  default: [
    'rgba(54, 162, 235, 0.8)',   // Blue
    'rgba(255, 99, 132, 0.8)',   // Red
    'rgba(75, 192, 192, 0.8)',   // Green
    'rgba(255, 206, 86, 0.8)',   // Yellow
    'rgba(153, 102, 255, 0.8)',  // Purple
    'rgba(255, 159, 64, 0.8)',   // Orange
  ],
  pastel: [
    'rgba(174, 198, 207, 0.8)',
    'rgba(255, 179, 186, 0.8)',
    'rgba(182, 215, 168, 0.8)',
    'rgba(250, 213, 165, 0.8)',
    'rgba(194, 178, 228, 0.8)',
    'rgba(255, 204, 153, 0.8)',
  ],
  vibrant: [
    'rgba(0, 123, 255, 0.8)',
    'rgba(220, 53, 69, 0.8)',
    'rgba(40, 167, 69, 0.8)',
    'rgba(255, 193, 7, 0.8)',
    'rgba(111, 66, 193, 0.8)',
    'rgba(253, 126, 20, 0.8)',
  ]
};
