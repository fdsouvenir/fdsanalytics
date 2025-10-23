// Timeframe Converter
// Converts relative and absolute timeframes to start/end dates

import { config } from '../config/config';

export interface DateRange {
  startDate: string; // YYYY-MM-DD format
  endDate: string;   // YYYY-MM-DD format
}

export class TimeframeConverter {
  private timezone: string;

  constructor(timezone: string = config.timezone) {
    this.timezone = timezone;
  }

  /**
   * Convert timeframe to date range
   */
  convert(timeframe: any): DateRange {
    if (timeframe.type === 'absolute') {
      return {
        startDate: this.formatDate(new Date(timeframe.start)),
        endDate: this.formatDate(new Date(timeframe.end))
      };
    }

    // Handle relative timeframes
    const now = new Date();
    const today = this.getLocalDate(now);

    switch (timeframe.relative) {
      case 'today':
        return {
          startDate: this.formatDate(today),
          endDate: this.formatDate(today)
        };

      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          startDate: this.formatDate(yesterday),
          endDate: this.formatDate(yesterday)
        };

      case 'this_week':
        const weekStart = this.getWeekStart(today);
        return {
          startDate: this.formatDate(weekStart),
          endDate: this.formatDate(today)
        };

      case 'last_week':
        const lastWeekEnd = this.getWeekStart(today);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        const lastWeekStart = this.getWeekStart(lastWeekEnd);
        return {
          startDate: this.formatDate(lastWeekStart),
          endDate: this.formatDate(lastWeekEnd)
        };

      case 'this_month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          startDate: this.formatDate(monthStart),
          endDate: this.formatDate(today)
        };

      case 'last_month':
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
        return {
          startDate: this.formatDate(lastMonthStart),
          endDate: this.formatDate(lastMonthEnd)
        };

      case 'last_7_days':
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return {
          startDate: this.formatDate(sevenDaysAgo),
          endDate: this.formatDate(today)
        };

      case 'last_30_days':
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return {
          startDate: this.formatDate(thirtyDaysAgo),
          endDate: this.formatDate(today)
        };

      default:
        throw new Error(`Unknown relative timeframe: ${timeframe.relative}`);
    }
  }

  /**
   * Get week start (Sunday)
   */
  private getWeekStart(date: Date): Date {
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    return weekStart;
  }

  /**
   * Get local date in configured timezone
   */
  private getLocalDate(date: Date): Date {
    // For simplicity, we're using UTC dates
    // In production, you'd use a library like date-fns-tz for proper timezone handling
    return date;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
