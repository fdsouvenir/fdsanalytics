/**
 * Date Parser Utility
 *
 * Parses relative date expressions (e.g., "last month", "this quarter", "last week")
 * into absolute date ranges for analytics queries.
 */

export interface DateRange {
  startDate: string;  // YYYY-MM-DD format
  endDate: string;    // YYYY-MM-DD format
}

/**
 * Parse relative date expression into absolute date range
 *
 * @param expression Relative date expression (e.g., "last month", "this quarter")
 * @param referenceDate Reference date for calculation (defaults to current date)
 * @returns DateRange with startDate and endDate in YYYY-MM-DD format
 */
export function parseRelativeDate(
  expression: string,
  referenceDate: Date = new Date()
): DateRange | null {
  const expr = expression.toLowerCase().trim();

  // Parse "last month"
  if (expr === 'last month') {
    const date = new Date(referenceDate);
    date.setMonth(date.getMonth() - 1);
    const year = date.getFullYear();
    const month = date.getMonth();

    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); // Last day of month

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  // Parse "this month"
  if (expr === 'this month') {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();

    const startDate = new Date(year, month, 1);
    const endDate = new Date(referenceDate); // Today

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  // Parse "last week"
  if (expr === 'last week') {
    const date = new Date(referenceDate);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    // Calculate start of last week (last Monday)
    const daysToLastMonday = dayOfWeek === 0 ? 13 : dayOfWeek + 6;
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - daysToLastMonday);

    // Calculate end of last week (last Sunday)
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  // Parse "this week"
  if (expr === 'this week') {
    const date = new Date(referenceDate);
    const dayOfWeek = date.getDay();

    // Calculate start of this week (this Monday)
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const startDate = new Date(date);
    startDate.setDate(date.getDate() - daysToMonday);

    // End date is today
    const endDate = new Date(referenceDate);

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  // Parse "last quarter"
  if (expr === 'last quarter') {
    const currentQuarter = Math.floor(referenceDate.getMonth() / 3);
    const year = currentQuarter === 0 ? referenceDate.getFullYear() - 1 : referenceDate.getFullYear();
    const quarter = currentQuarter === 0 ? 3 : currentQuarter - 1;

    const startMonth = quarter * 3;
    const endMonth = startMonth + 2;

    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(year, endMonth + 1, 0); // Last day of quarter

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  // Parse "this quarter"
  if (expr === 'this quarter') {
    const currentQuarter = Math.floor(referenceDate.getMonth() / 3);
    const year = referenceDate.getFullYear();

    const startMonth = currentQuarter * 3;

    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(referenceDate); // Today

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  // Parse "last year"
  if (expr === 'last year') {
    const year = referenceDate.getFullYear() - 1;

    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`
    };
  }

  // Parse "this year"
  if (expr === 'this year') {
    const year = referenceDate.getFullYear();
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(referenceDate);

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate)
    };
  }

  // Parse "Q1", "Q2", "Q3", "Q4" (with optional year: "Q1 2025", "Q2 2024", etc.)
  const quarterMatch = expr.match(/^q([1-4])(?:\s+(\d{4}))?$/i);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1]);
    const year = quarterMatch[2] ? parseInt(quarterMatch[2]) : referenceDate.getFullYear();
    return getQuarterRange(quarter, year);
  }

  // Unable to parse
  return null;
}

/**
 * Format Date object as YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get quarter number (1-4) for a given date
 */
export function getQuarter(date: Date = new Date()): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Get date range for a specific quarter
 *
 * @param quarter Quarter number (1-4)
 * @param year Year (defaults to current year)
 */
export function getQuarterRange(quarter: number, year?: number): DateRange {
  const targetYear = year ?? new Date().getFullYear();

  if (quarter < 1 || quarter > 4) {
    throw new Error('Quarter must be between 1 and 4');
  }

  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;

  const startDate = new Date(targetYear, startMonth, 1);
  const endDate = new Date(targetYear, endMonth + 1, 0);

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  };
}
