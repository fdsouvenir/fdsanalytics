import { ChartBuilder } from '../../src/chart/ChartBuilder';
import { ChartSpec } from '../../src/chart/chartTypes';
import {
  mockDateSeriesData,
  mockDayOfWeekData,
  mockCategoryData,
  mockSubcategoryData
} from '../fixtures/mockResponses';

/**
 * Integration tests for chart rendering - verify labels are properly
 * formatted in actual quickchart.io URLs
 *
 * These tests decode the generated URL and validate that:
 * 1. Labels are strings (not objects)
 * 2. Dates are formatted as "Oct 24" or day names
 * 3. Categories are preserved exactly
 * 4. No "[object Object]" appears in URLs
 */
describe('Chart URL Generation - Label Formats (Integration)', () => {
  let chartBuilder: ChartBuilder;

  beforeEach(() => {
    chartBuilder = new ChartBuilder();
  });

  /**
   * Helper to decode quickchart.io URL and extract config
   */
  function decodeChartUrl(url: string): any {
    const urlParams = new URLSearchParams(url.split('?')[1]);
    const encodedConfig = urlParams.get('c');
    if (!encodedConfig) {
      throw new Error('No config found in URL');
    }
    return JSON.parse(decodeURIComponent(encodedConfig));
  }

  describe('Date label formatting', () => {
    it('should format Date objects as short dates (e.g., "Jan 20") in URL', async () => {
      // Simulate what ResponseGenerator does: converts Dates to formatted strings
      const dates = [
        new Date('2025-01-20T00:00:00Z'),
        new Date('2025-01-21T00:00:00Z'),
        new Date('2025-01-22T00:00:00Z')
      ];
      const formattedLabels = dates.map(d =>
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      );

      const spec: ChartSpec = {
        type: 'line',
        title: 'Sales Trend',
        data: {
          labels: formattedLabels,
          datasets: [
            {
              label: 'Sales',
              data: [4500, 4800, 5200]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).not.toBeNull();
      expect(url).toContain('quickchart.io/chart');

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // All labels should be strings
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);

      // Should be formatted as short dates (Month Day)
      expect(labels[0]).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/); // "Jan 20"
      expect(labels[1]).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/); // "Jan 21"
      expect(labels[2]).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/); // "Jan 22"

      // Should NOT contain "[object Object]" or verbose ISO timestamps
      labels.forEach((label: string) => {
        expect(label).not.toContain('[object Object]');
        expect(label).not.toMatch(/T\d{2}:\d{2}:\d{2}/); // No ISO time portion
      });
    });

    it('should handle ISO date strings when passed directly', async () => {
      // Note: In practice, ResponseGenerator would format these using formatChartLabel.
      // This test verifies that if ISO strings somehow reach ChartBuilder, they pass through.
      const spec: ChartSpec = {
        type: 'bar',
        title: 'Weekly Sales',
        data: {
          labels: ['2025-01-20', '2025-01-21', '2025-01-22'], // ISO strings (unformatted)
          datasets: [
            {
              label: 'Sales',
              data: [4500, 4800, 5200]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // Should pass through as strings (ChartBuilder doesn't format, that's ResponseGenerator's job)
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);
      expect(labels).toEqual(['2025-01-20', '2025-01-21', '2025-01-22']);

      // Key: no [object Object] even if unformatted
      labels.forEach((label: string) => {
        expect(label).not.toContain('[object Object]');
      });
    });
  });

  describe('Day-of-week label formatting', () => {
    it('should format dates as day names for day_of_week field', async () => {
      // Note: This test validates that when ResponseGenerator creates the spec
      // with day_of_week field, labels are formatted as day names
      const spec: ChartSpec = {
        type: 'bar',
        title: 'Sales by Day of Week',
        data: {
          labels: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], // Pre-formatted by ResponseGenerator
          datasets: [
            {
              label: 'Total Sales',
              data: [5000, 5500, 6000, 6200, 7000]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // Should be day names
      expect(labels).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);
    });
  });

  describe('Category label preservation', () => {
    it('should preserve primary category labels with parentheses in URL', async () => {
      const spec: ChartSpec = {
        type: 'bar',
        title: 'Sales by Category',
        data: {
          labels: ['(Beer)', '(Sushi)', '(Food)', '(Wine)'],
          datasets: [
            {
              label: 'Net Sales',
              data: [5234.50, 8123.75, 12456.25, 3456.00]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // Should preserve exact category format
      expect(labels).toEqual(['(Beer)', '(Sushi)', '(Food)', '(Wine)']);
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);

      // Parentheses should be preserved
      expect(labels[0]).toContain('(');
      expect(labels[0]).toContain(')');
    });

    it('should preserve subcategory labels without parentheses in URL', async () => {
      const spec: ChartSpec = {
        type: 'horizontalBar',
        title: 'Top Subcategories',
        data: {
          labels: ['Draft Beer', 'Bottle Beer', 'Signature Rolls', 'Classic Rolls'],
          datasets: [
            {
              label: 'Quantity Sold',
              data: [45, 32, 28, 35]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // Should preserve exact subcategory format (no parentheses added)
      expect(labels).toEqual(['Draft Beer', 'Bottle Beer', 'Signature Rolls', 'Classic Rolls']);
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);
    });
  });

  describe('Number label formatting', () => {
    it('should convert number labels to strings in URL', async () => {
      const spec: ChartSpec = {
        type: 'line',
        title: 'Sequence',
        data: {
          labels: ['1', '2', '3', '4', '5'], // Already strings (formatChartLabel converts)
          datasets: [
            {
              label: 'Values',
              data: [10, 20, 30, 40, 50]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // Should be string numbers
      expect(labels).toEqual(['1', '2', '3', '4', '5']);
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);
    });
  });

  describe('Mixed label types', () => {
    it('should handle mixed string and formatted date labels in URL', async () => {
      const spec: ChartSpec = {
        type: 'line',
        title: 'Mixed Labels',
        data: {
          labels: ['Jan 20', 'Jan 21', 'Category A', 'Jan 23'], // Mix of dates and strings
          datasets: [
            {
              label: 'Values',
              data: [100, 200, 150, 180]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // All should be strings
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);

      // No [object Object]
      labels.forEach((label: string) => {
        expect(label).not.toBe('[object Object]');
        expect(label).not.toContain('[object');
      });
    });
  });

  describe('Defensive validation', () => {
    it('should reject ChartSpec with [object Object] labels', async () => {
      const spec: any = {
        type: 'bar',
        title: 'Invalid Chart',
        data: {
          labels: ['Valid', '[object Object]', 'Label'],
          datasets: [
            {
              label: 'Values',
              data: [100, 200, 300]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);

      // Should return null due to defensive validation
      expect(url).toBeNull();
    });

    it('should convert non-string labels to strings (defensive fallback)', async () => {
      const spec: any = {
        type: 'bar',
        title: 'Test',
        data: {
          labels: ['A', 123, 'C'], // Number in the middle
          datasets: [
            {
              label: 'Values',
              data: [100, 200, 300]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // Number should be converted to string
      expect(labels).toEqual(['A', '123', 'C']);
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);
    });
  });

  describe('URL structure validation', () => {
    it('should generate valid quickchart.io URL structure', async () => {
      const spec: ChartSpec = {
        type: 'bar',
        title: 'Test Chart',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [
            {
              label: 'Data',
              data: [100, 200, 300]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).not.toBeNull();

      // Should have correct base URL
      expect(url).toContain('https://quickchart.io/chart');

      // Should have config parameter
      expect(url).toContain('?c=');

      // Should have dimensions
      expect(url).toContain('width=600');
      expect(url).toContain('height=400');

      // Should be reasonably sized (not too long)
      expect(url!.length).toBeLessThan(15000);
    });

    it('should encode special characters in labels properly', async () => {
      const spec: ChartSpec = {
        type: 'bar',
        title: 'Special Characters',
        data: {
          labels: ['Category #1', 'Item & Product', 'Value (Est.)'],
          datasets: [
            {
              label: 'Sales',
              data: [100, 200, 300]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      // Special characters should be preserved after decode
      expect(labels[0]).toContain('#');
      expect(labels[1]).toContain('&');
      expect(labels[2]).toContain('(');
      expect(labels[2]).toContain(')');
    });

    it('should handle empty labels gracefully', async () => {
      const spec: ChartSpec = {
        type: 'bar',
        title: 'Empty Labels',
        data: {
          labels: ['', 'B', ''],
          datasets: [
            {
              label: 'Data',
              data: [100, 200, 300]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);
      const labels = config.data.labels;

      expect(labels).toEqual(['', 'B', '']);
      expect(labels.every((l: any) => typeof l === 'string')).toBe(true);
    });
  });

  describe('End-to-end scenarios', () => {
    it('should create valid chart URL from date series data (realistic scenario)', async () => {
      // Simulate what ResponseGenerator would create
      const dates = mockDateSeriesData.rows.map(row => row.report_date);
      const values = mockDateSeriesData.rows.map(row => row.net_sales);

      const spec: ChartSpec = {
        type: 'line',
        title: 'Daily Sales Trend',
        data: {
          labels: dates.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
          datasets: [
            {
              label: 'Net Sales',
              data: values
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);

      // Verify structure
      expect(config.type).toBe('line');
      expect(config.data.labels).toHaveLength(4);
      expect(config.data.datasets[0].data).toEqual(values);

      // Verify labels are formatted dates
      config.data.labels.forEach((label: string) => {
        expect(label).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
        expect(label).not.toBe('[object Object]');
      });
    });

    it('should create valid chart URL from category data (realistic scenario)', async () => {
      const categories = mockCategoryData.rows.map(row => row.primary_category);
      const sales = mockCategoryData.rows.map(row => row.net_sales);

      const spec: ChartSpec = {
        type: 'bar',
        title: 'Sales by Category',
        data: {
          labels: categories,
          datasets: [
            {
              label: 'Net Sales',
              data: sales
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);
      expect(url).not.toBeNull();

      const config = decodeChartUrl(url!);

      // Verify categories are preserved
      expect(config.data.labels).toEqual(['(Beer)', '(Sushi)', '(Food)', '(Wine)']);

      // No object stringification occurred
      config.data.labels.forEach((label: string) => {
        expect(label).not.toContain('[object');
        expect(label).not.toMatch(/\d{4}-\d{2}-\d{2}T/); // No ISO timestamps
      });
    });
  });
});
