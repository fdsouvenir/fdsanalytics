import { ChartBuilder } from '../../src/chart/ChartBuilder';

describe('ChartBuilder', () => {
  let chartBuilder: ChartBuilder;

  beforeEach(() => {
    chartBuilder = new ChartBuilder();
  });

  describe('generateChartUrl', () => {
    it('should generate valid quickchart.io URL for bar chart', async () => {
      const spec = ChartBuilder.createSampleBarChart(
        'Sales by Category',
        ['Beer', 'Sushi', 'Food'],
        [5234, 8123, 12456]
      );

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).not.toBeNull();
      expect(url).toContain('https://quickchart.io/chart');
      expect(url).toContain('c=');
    });

    it('should generate valid URL for line chart', async () => {
      const spec = ChartBuilder.createSampleLineChart(
        'Sales Trend',
        ['Mon', 'Tue', 'Wed'],
        [1000, 1200, 1100]
      );

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).not.toBeNull();
      expect(url).toContain('https://quickchart.io/chart');
    });

    it('should return null for invalid spec', async () => {
      const invalidSpec: any = {
        type: 'bar',
        title: 'Test',
        data: {
          labels: [],
          datasets: []
        }
      };

      const url = await chartBuilder.generateChartUrl(invalidSpec);

      expect(url).toBeNull();
    });

    it('should return null for mismatched data lengths', async () => {
      const invalidSpec: any = {
        type: 'bar',
        title: 'Test',
        data: {
          labels: ['A', 'B', 'C'],
          datasets: [
            {
              label: 'Sales',
              data: [100, 200] // Wrong length!
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(invalidSpec);

      expect(url).toBeNull();
    });

    it('should return null for too many data points (>20)', async () => {
      const labels = Array.from({ length: 25 }, (_, i) => `Item ${i}`);
      const values = Array.from({ length: 25 }, (_, i) => i * 100);

      const spec = ChartBuilder.createSampleBarChart('Too Many Items', labels, values);

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).toBeNull();
    });

    it('should open circuit breaker after 5 failures', async () => {
      const invalidSpec: any = {
        type: 'bar',
        data: {} // Missing required fields
      };

      // Trigger 5 failures
      for (let i = 0; i < 5; i++) {
        await chartBuilder.generateChartUrl(invalidSpec);
      }

      // 6th attempt should be blocked by circuit breaker
      const validSpec = ChartBuilder.createSampleBarChart('Test', ['A'], [100]);
      const url = await chartBuilder.generateChartUrl(validSpec);

      expect(url).toBeNull(); // Circuit breaker prevents attempt
    });
  });

  describe('createSampleBarChart', () => {
    it('should create valid bar chart spec', () => {
      const spec = ChartBuilder.createSampleBarChart(
        'Test Chart',
        ['A', 'B', 'C'],
        [100, 200, 300]
      );

      expect(spec.type).toBe('bar');
      expect(spec.title).toBe('Test Chart');
      expect(spec.data.labels).toEqual(['A', 'B', 'C']);
      expect(spec.data.datasets[0].data).toEqual([100, 200, 300]);
    });
  });

  describe('createSampleLineChart', () => {
    it('should create valid line chart spec', () => {
      const spec = ChartBuilder.createSampleLineChart(
        'Trend',
        ['Mon', 'Tue', 'Wed'],
        [10, 20, 15]
      );

      expect(spec.type).toBe('line');
      expect(spec.title).toBe('Trend');
      expect(spec.data.datasets[0].borderColor).toBeDefined();
    });
  });

  describe('defensive validation for label types', () => {
    let consoleWarnSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should convert non-string labels to strings and warn', async () => {
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

      // Should succeed after converting number to string
      expect(url).not.toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Non-string label detected in chart data',
        expect.objectContaining({
          index: 1,
          labelType: 'number',
          labelValue: 123
        })
      );
      // Label should be converted to string
      expect(spec.data.labels[1]).toBe('123');
    });

    it('should throw error for "[object Object]" labels', async () => {
      const spec: any = {
        type: 'bar',
        title: 'Test',
        data: {
          labels: ['A', '[object Object]', 'C'],
          datasets: [
            {
              label: 'Values',
              data: [100, 200, 300]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);

      // Should fail due to [object Object] detection
      expect(url).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Invalid label "[object Object]" detected',
        expect.objectContaining({
          index: 1,
          message: 'This indicates an object was improperly stringified upstream'
        })
      );
    });

    it('should handle Date objects in labels with warning', async () => {
      const spec: any = {
        type: 'line',
        title: 'Test',
        data: {
          labels: ['Day 1', new Date('2025-10-24'), 'Day 3'],
          datasets: [
            {
              label: 'Values',
              data: [100, 200, 300]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);

      // Should succeed after converting Date to string
      expect(url).not.toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Non-string label detected in chart data',
        expect.objectContaining({
          index: 1,
          labelType: 'object'
        })
      );
      // Date should be converted to string (String() produces verbose format)
      expect(typeof spec.data.labels[1]).toBe('string');
      expect(spec.data.labels[1]).toContain('2025'); // Year should be present
      expect(spec.data.labels[1]).toContain('Oct'); // Month should be present
    });

    it('should handle multiple non-string labels', async () => {
      const spec: any = {
        type: 'bar',
        title: 'Test',
        data: {
          labels: [true, 42, false, 100],
          datasets: [
            {
              label: 'Values',
              data: [10, 20, 30, 40]
            }
          ]
        }
      };

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).not.toBeNull();
      // Should warn for each non-string label
      expect(consoleWarnSpy).toHaveBeenCalledTimes(4);
      // All labels should be converted to strings
      expect(spec.data.labels).toEqual(['true', '42', 'false', '100']);
    });

    it('should accept all valid string labels without warnings', async () => {
      const spec = ChartBuilder.createSampleBarChart(
        'Valid Chart',
        ['Label1', 'Label2', 'Label3'],
        [100, 200, 300]
      );

      const url = await chartBuilder.generateChartUrl(spec);

      expect(url).not.toBeNull();
      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
