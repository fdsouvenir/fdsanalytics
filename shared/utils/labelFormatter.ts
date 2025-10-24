import { getDayOfWeek } from './date';

/**
 * Format a value for use as a chart label.
 * Applies context-aware formatting based on field name and data type.
 *
 * @param value - The raw value from query results (any type)
 * @param fieldName - The field name to provide context for formatting
 * @returns A formatted string suitable for chart labels
 *
 * @example
 * formatChartLabel(new Date('2025-10-24'), 'report_date') // "Oct 24"
 * formatChartLabel(new Date('2025-10-24'), 'day_of_week') // "Friday"
 * formatChartLabel('(Beer)', 'primary_category') // "(Beer)"
 * formatChartLabel(42, 'quantity') // "42"
 */
export function formatChartLabel(value: any, fieldName: string): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Already a string - check if it needs parsing as a date
  if (typeof value === 'string') {
    // Try to parse as date if field name suggests it's a date
    if (isDateField(fieldName)) {
      const parsed = tryParseDate(value);
      if (parsed) {
        return formatDateLabel(parsed, fieldName);
      }
    }
    // Return string as-is (categories, item names, etc.)
    return value;
  }

  // Number - stringify
  if (typeof value === 'number') {
    return String(value);
  }

  // Date object - format based on context
  if (value instanceof Date) {
    return formatDateLabel(value, fieldName);
  }

  // Object or other type - try to extract meaningful value
  if (typeof value === 'object') {
    // Try common object patterns
    if ('value' in value && value.value !== undefined) {
      return formatChartLabel(value.value, fieldName);
    }
    if ('label' in value && value.label !== undefined) {
      return formatChartLabel(value.label, fieldName);
    }
    if ('name' in value && value.name !== undefined) {
      return formatChartLabel(value.name, fieldName);
    }

    // Fallback to JSON stringification (better than [object Object])
    try {
      const json = JSON.stringify(value);
      console.warn('Complex object used as chart label', {
        fieldName,
        value,
        stringified: json
      });
      return json;
    } catch {
      console.warn('Non-serializable object used as chart label', { fieldName });
      return String(value);
    }
  }

  // Final fallback
  return String(value);
}

/**
 * Check if field name suggests this is a date field
 */
function isDateField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();
  return (
    lowerName.includes('date') ||
    lowerName.includes('time') ||
    lowerName === 'created_at' ||
    lowerName === 'updated_at' ||
    lowerName.includes('timestamp') ||
    isDayOfWeekField(fieldName) // Day-of-week fields may contain date values
  );
}

/**
 * Check if field name is for day-of-week analysis
 */
function isDayOfWeekField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();
  return (
    lowerName === 'day_of_week' ||
    lowerName === 'dow' ||
    lowerName === 'weekday' ||
    lowerName.includes('day_name')
  );
}

/**
 * Try to parse a string as a date.
 * Only parses ISO-format date strings.
 */
function tryParseDate(value: string): Date | null {
  try {
    // Check if it looks like an ISO date (YYYY-MM-DD or full ISO string)
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      const date = new Date(value);
      // Verify it's a valid date
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  } catch {
    // Not a parseable date
  }
  return null;
}

/**
 * Format a Date object for chart labels based on field context
 */
function formatDateLabel(date: Date, fieldName: string): string {
  // Day-of-week fields get day names (Monday, Tuesday, etc.)
  if (isDayOfWeekField(fieldName)) {
    return getDayOfWeek(date);
  }

  // Regular date fields get short format (Oct 24, Nov 15)
  return formatShortDate(date);
}

/**
 * Format date as "Oct 24" or "Nov 15" (short month + day)
 */
function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  });
}
