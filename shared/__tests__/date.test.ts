/**
 * Unit tests for date utilities
 */

import {
  formatDate,
  formatDateTime,
  parseDate,
  toISODate,
  getCurrentDate,
  addDays,
  subtractDays,
  getStartOfDay,
  getEndOfDay,
  getDayOfWeek,
} from '../utils/date';

describe('Date Utilities', () => {
  const testDate = new Date('2025-10-22T14:30:00.000Z');

  describe('formatDate', () => {
    it('should format date as YYYY-MM-DD', () => {
      expect(formatDate(testDate)).toBe('2025-10-22');
    });
  });

  describe('formatDateTime', () => {
    it('should return ISO string when no timezone provided', () => {
      expect(formatDateTime(testDate)).toBe('2025-10-22T14:30:00.000Z');
    });

    it('should format with timezone when provided', () => {
      const formatted = formatDateTime(testDate, 'America/Chicago');
      expect(formatted).toContain('2025');
    });
  });

  describe('parseDate', () => {
    it('should parse valid date string', () => {
      const date = parseDate('2025-10-22T12:00:00Z');
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2025);
      expect(date.getUTCMonth()).toBe(9);
      expect(date.getUTCDate()).toBe(22);
    });

    it('should throw error for invalid date string', () => {
      expect(() => parseDate('invalid-date')).toThrow('Invalid date string');
    });
  });

  describe('toISODate', () => {
    it('should convert date to ISO date string', () => {
      expect(toISODate(testDate)).toBe('2025-10-22');
    });
  });

  describe('getCurrentDate', () => {
    it('should return current date', () => {
      const now = getCurrentDate();
      expect(now).toBeInstanceOf(Date);
      expect(now.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('addDays', () => {
    it('should add days to date', () => {
      const result = addDays(testDate, 5);
      expect(toISODate(result)).toBe('2025-10-27');
    });

    it('should handle negative days', () => {
      const result = addDays(testDate, -5);
      expect(toISODate(result)).toBe('2025-10-17');
    });

    it('should not mutate original date', () => {
      const original = new Date(testDate);
      addDays(testDate, 5);
      expect(testDate).toEqual(original);
    });
  });

  describe('subtractDays', () => {
    it('should subtract days from date', () => {
      const result = subtractDays(testDate, 5);
      expect(toISODate(result)).toBe('2025-10-17');
    });

    it('should not mutate original date', () => {
      const original = new Date(testDate);
      subtractDays(testDate, 5);
      expect(testDate).toEqual(original);
    });
  });

  describe('getStartOfDay', () => {
    it('should return start of day', () => {
      const result = getStartOfDay(testDate);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });

    it('should not mutate original date', () => {
      const original = new Date(testDate);
      getStartOfDay(testDate);
      expect(testDate).toEqual(original);
    });
  });

  describe('getEndOfDay', () => {
    it('should return end of day', () => {
      const result = getEndOfDay(testDate);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
      expect(result.getSeconds()).toBe(59);
      expect(result.getMilliseconds()).toBe(999);
    });

    it('should not mutate original date', () => {
      const original = new Date(testDate);
      getEndOfDay(testDate);
      expect(testDate).toEqual(original);
    });
  });

  describe('getDayOfWeek', () => {
    it('should return correct day name', () => {
      const wednesday = new Date('2025-10-22T12:00:00Z');
      const expectedDay = getDayOfWeek(wednesday);
      expect(['Tuesday', 'Wednesday']).toContain(expectedDay);

      const sunday = new Date('2025-10-26T12:00:00Z');
      const expectedSunday = getDayOfWeek(sunday);
      expect(['Saturday', 'Sunday']).toContain(expectedSunday);
    });
  });
});
