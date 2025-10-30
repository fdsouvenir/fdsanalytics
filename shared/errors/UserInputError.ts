/**
 * UserInputError - for validation and user input errors (4xx)
 * Based on Section 2.1 of docs/05-error-handling.md
 */

import { AppError } from './AppError';

export class UserInputError extends AppError {
  public readonly suggestions?: string[];

  constructor(
    message: string,
    code: string,
    context?: Record<string, any>,
    suggestions?: string[]
  ) {
    super(message, code, context);
    this.name = 'UserInputError';
    this.suggestions = suggestions;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      suggestions: this.suggestions,
    };
  }
}

export const UserInputErrorCodes = {
  INVALID_CATEGORY: 'INVALID_CATEGORY',
  INVALID_TIMEFRAME: 'INVALID_TIMEFRAME',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  AMBIGUOUS_QUERY: 'AMBIGUOUS_QUERY',
  MISSING_REQUIRED_PARAM: 'MISSING_REQUIRED_PARAM',
  PARAM_OUT_OF_RANGE: 'PARAM_OUT_OF_RANGE',
  NO_DATA_FOUND: 'NO_DATA_FOUND',
} as const;
