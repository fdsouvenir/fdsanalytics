/**
 * Unit tests for currency utilities
 */

import {
  formatCurrency,
  parseCurrencyString,
  formatPercentage,
  calculatePercentageChange,
} from '../utils/currency';

describe('Currency Utilities', () => {
  describe('formatCurrency', () => {
    it('should format number as USD currency by default', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should format with two decimal places', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-500.25)).toBe('-$500.25');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toBe('$0.00');
    });

    it('should handle large numbers', () => {
      expect(formatCurrency(1234567.89)).toBe('$1,234,567.89');
    });

    it('should support different currencies', () => {
      const formatted = formatCurrency(100, 'EUR');
      expect(formatted).toContain('100');
    });
  });

  describe('parseCurrencyString', () => {
    it('should parse USD currency string', () => {
      expect(parseCurrencyString('$1,234.56')).toBe(1234.56);
    });

    it('should handle string without dollar sign', () => {
      expect(parseCurrencyString('1234.56')).toBe(1234.56);
    });

    it('should handle string without commas', () => {
      expect(parseCurrencyString('$1234.56')).toBe(1234.56);
    });

    it('should handle negative amounts', () => {
      expect(parseCurrencyString('-$500.25')).toBe(-500.25);
    });

    it('should throw error for invalid string', () => {
      expect(() => parseCurrencyString('invalid')).toThrow('Invalid currency string');
    });

    it('should handle zero', () => {
      expect(parseCurrencyString('$0.00')).toBe(0);
    });
  });

  describe('formatPercentage', () => {
    it('should format percentage with 1 decimal by default', () => {
      expect(formatPercentage(12.5)).toBe('12.5%');
    });

    it('should format with specified decimals', () => {
      expect(formatPercentage(12.567, 2)).toBe('12.57%');
    });

    it('should handle negative percentages', () => {
      expect(formatPercentage(-5.3)).toBe('-5.3%');
    });

    it('should handle zero', () => {
      expect(formatPercentage(0)).toBe('0.0%');
    });

    it('should round properly', () => {
      expect(formatPercentage(12.56, 1)).toBe('12.6%');
    });
  });

  describe('calculatePercentageChange', () => {
    it('should calculate positive percentage change', () => {
      expect(calculatePercentageChange(150, 100)).toBe(50);
    });

    it('should calculate negative percentage change', () => {
      expect(calculatePercentageChange(75, 100)).toBe(-25);
    });

    it('should handle zero baseline as 100% increase when current > 0', () => {
      expect(calculatePercentageChange(100, 0)).toBe(100);
    });

    it('should handle zero baseline and zero current as 0%', () => {
      expect(calculatePercentageChange(0, 0)).toBe(0);
    });

    it('should handle identical values as 0%', () => {
      expect(calculatePercentageChange(100, 100)).toBe(0);
    });

    it('should calculate decimal percentages', () => {
      const result = calculatePercentageChange(101, 100);
      expect(result).toBeCloseTo(1, 2);
    });

    it('should handle large numbers', () => {
      const result = calculatePercentageChange(1000000, 500000);
      expect(result).toBe(100);
    });
  });
});
