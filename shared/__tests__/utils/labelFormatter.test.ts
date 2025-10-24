import { formatChartLabel } from '../../utils/labelFormatter';

describe('formatChartLabel', () => {
  describe('Date object formatting', () => {
    const testDate = new Date('2025-10-24T14:30:00.000Z');

    it('should format Date object as short date for report_date field', () => {
      const result = formatChartLabel(testDate, 'report_date');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/); // "Oct 24" format
    });

    it('should format Date object as short date for date field', () => {
      const result = formatChartLabel(testDate, 'date');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/); // "Oct 24" format
    });

    it('should format Date object as day name for day_of_week field', () => {
      const result = formatChartLabel(testDate, 'day_of_week');
      expect(result).toBe('Friday'); // 2025-10-24 UTC is a Friday
    });

    it('should format Date object as day name for dow field', () => {
      const result = formatChartLabel(testDate, 'dow');
      expect(result).toBe('Friday');
    });

    it('should format Date object as day name for weekday field', () => {
      const result = formatChartLabel(testDate, 'weekday');
      expect(result).toBe('Friday');
    });

    it('should format Date object as short date for created_at field', () => {
      const result = formatChartLabel(testDate, 'created_at');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
    });
  });

  describe('ISO date string formatting', () => {
    it('should parse and format ISO date string for date field', () => {
      const result = formatChartLabel('2025-10-24', 'report_date');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/); // "Oct 24" format
    });

    it('should parse and format full ISO datetime string', () => {
      const result = formatChartLabel('2025-10-24T14:30:00.000Z', 'date');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
    });

    it('should format ISO date as day name for day_of_week field', () => {
      const result = formatChartLabel('2025-10-24', 'day_of_week');
      expect(result).toBe('Thursday'); // 2025-10-24 is a Thursday
    });

    it('should not parse non-ISO date strings as dates', () => {
      const result = formatChartLabel('not a date', 'date');
      expect(result).toBe('not a date');
    });
  });

  describe('Category string formatting', () => {
    it('should preserve primary category with parentheses', () => {
      const result = formatChartLabel('(Beer)', 'primary_category');
      expect(result).toBe('(Beer)');
    });

    it('should preserve subcategory without parentheses', () => {
      const result = formatChartLabel('Draft Beer', 'subcategory');
      expect(result).toBe('Draft Beer');
    });

    it('should preserve category as-is', () => {
      const result = formatChartLabel('Signature Rolls', 'category');
      expect(result).toBe('Signature Rolls');
    });

    it('should preserve item name as-is', () => {
      const result = formatChartLabel('California Roll', 'item_name');
      expect(result).toBe('California Roll');
    });
  });

  describe('Number formatting', () => {
    it('should convert number to string', () => {
      const result = formatChartLabel(42, 'quantity');
      expect(result).toBe('42');
    });

    it('should convert float to string', () => {
      const result = formatChartLabel(123.45, 'price');
      expect(result).toBe('123.45');
    });

    it('should convert zero to string', () => {
      const result = formatChartLabel(0, 'count');
      expect(result).toBe('0');
    });

    it('should convert negative number to string', () => {
      const result = formatChartLabel(-10, 'adjustment');
      expect(result).toBe('-10');
    });
  });

  describe('Object handling', () => {
    it('should extract value property from object', () => {
      const obj = { value: 'extracted' };
      const result = formatChartLabel(obj, 'field');
      expect(result).toBe('extracted');
    });

    it('should extract label property from object', () => {
      const obj = { label: 'labeled' };
      const result = formatChartLabel(obj, 'field');
      expect(result).toBe('labeled');
    });

    it('should extract name property from object', () => {
      const obj = { name: 'named' };
      const result = formatChartLabel(obj, 'field');
      expect(result).toBe('named');
    });

    it('should prioritize value over label', () => {
      const obj = { value: 'first', label: 'second' };
      const result = formatChartLabel(obj, 'field');
      expect(result).toBe('first');
    });

    it('should JSON.stringify complex objects without extractable properties', () => {
      const obj = { foo: 'bar', baz: 123 };
      const result = formatChartLabel(obj, 'field');
      expect(result).toBe('{"foo":"bar","baz":123}');
    });

    it('should handle nested object extraction', () => {
      const obj = { value: { nested: 'data' } };
      const result = formatChartLabel(obj, 'field');
      expect(result).toBe('{"nested":"data"}');
    });
  });

  describe('Null and undefined handling', () => {
    it('should return empty string for null', () => {
      const result = formatChartLabel(null, 'field');
      expect(result).toBe('');
    });

    it('should return empty string for undefined', () => {
      const result = formatChartLabel(undefined, 'field');
      expect(result).toBe('');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = formatChartLabel('', 'field');
      expect(result).toBe('');
    });

    it('should handle boolean values', () => {
      expect(formatChartLabel(true, 'field')).toBe('true');
      expect(formatChartLabel(false, 'field')).toBe('false');
    });

    it('should handle array (fallback to JSON string)', () => {
      const result = formatChartLabel([1, 2, 3], 'field');
      expect(result).toBe('[1,2,3]'); // Arrays are JSON.stringified
    });

    it('should handle invalid Date objects', () => {
      const invalidDate = new Date('invalid');
      const result = formatChartLabel(invalidDate, 'date');
      // Invalid Date.toString() returns "Invalid Date"
      expect(result).toContain('Invalid');
    });

    it('should handle ISO date with timezone', () => {
      const result = formatChartLabel('2025-10-24T14:30:00-05:00', 'date');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
    });

    it('should not parse partial ISO dates incorrectly', () => {
      const result = formatChartLabel('2025-10', 'date');
      expect(result).toBe('2025-10'); // Not a complete date
    });
  });

  describe('Field name case sensitivity', () => {
    it('should handle uppercase field names', () => {
      const result = formatChartLabel('2025-10-24', 'REPORT_DATE');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
    });

    it('should handle mixed case field names', () => {
      const result = formatChartLabel('2025-10-24', 'ReportDate');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
    });

    it('should handle day_of_week variations', () => {
      const date = new Date('2025-10-24T14:30:00.000Z');
      const expectedDay = date.toLocaleDateString('en-US', { weekday: 'long' });
      expect(formatChartLabel(date, 'DAY_OF_WEEK')).toBe(expectedDay);
      expect(formatChartLabel(date, 'Day_Of_Week')).toBe(expectedDay);
    });
  });

  describe('Real-world BigQuery scenarios', () => {
    it('should handle typical category query result', () => {
      const row = { primary_category: '(Beer)', net_sales: 1234.56 };
      const result = formatChartLabel(row.primary_category, 'primary_category');
      expect(result).toBe('(Beer)');
    });

    it('should handle typical date query result', () => {
      const row = { report_date: '2025-10-24', net_sales: 1234.56 };
      const result = formatChartLabel(row.report_date, 'report_date');
      expect(result).toMatch(/^[A-Z][a-z]{2}\s+\d{1,2}$/);
    });

    it('should handle day-of-week analysis result', () => {
      const row = { day_of_week: 'Friday', total: 5000 };
      const result = formatChartLabel(row.day_of_week, 'day_of_week');
      expect(result).toBe('Friday');
    });

    it('should handle item name result', () => {
      const row = { item_name: 'California Roll', quantity_sold: 42 };
      const result = formatChartLabel(row.item_name, 'item_name');
      expect(result).toBe('California Roll');
    });
  });
});
