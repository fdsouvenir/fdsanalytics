# Intent Functions
## Senso Restaurant Analytics - Version 1.0

**Purpose:** Document all 8 intent-based analytics functions, their parameters, hybrid cache implementation, and BigQuery stored procedure mappings.

---

## 1. Overview

The Response Engine uses **intent-based function calling** instead of a monolithic analytics tool. Each intent function:
- Maps to a specific user query pattern
- Has minimal, well-defined parameters
- Uses hybrid caching (insights fast path vs raw metrics slow path)
- Calls BigQuery stored procedures for security

**Key Implementation Files:**
- `services/response-engine/src/tools/intentFunctions.ts` - Function definitions for Gemini
- `services/response-engine/src/tools/AnalyticsToolHandler.ts` - Execution logic

---

## 2. All 8 Intent Functions

| Function | Description | Cache Strategy |
|----------|-------------|----------------|
| show_daily_sales | Daily sales breakdown | Hybrid (insights → query_metrics) |
| show_top_items | Top N best-selling items | Hybrid (insights → query_metrics) |
| show_category_breakdown | Sales by category | Hybrid (insights → query_metrics) |
| get_total_sales | Total sales for period | Direct (query_metrics) |
| find_peak_day | Highest or lowest day | Direct (query_metrics) |
| compare_day_types | Weekday vs weekend | Direct (query_metrics) |
| track_item_performance | Specific item over time | Direct (query_metrics) |
| compare_periods | Compare two time periods | Direct (query_metrics) |

---

## 3. Function Details

### 3.1 show_daily_sales

**Description:** Show sales broken down by day for a date range with optional category filter.

**Parameters:**
```typescript
{
  startDate: string;    // YYYY-MM-DD format (REQUIRED)
  endDate: string;      // YYYY-MM-DD format (REQUIRED)
  category?: string;    // Optional category filter
}
```

**Example Queries:**
- "Show daily sales from May 1 to May 31"
- "Daily sales for July in the Sushi category"
- "Day-by-day breakdown for last month"

**Gemini Function Declaration:**
```typescript
{
  name: 'show_daily_sales',
  description: 'Show sales broken down by day for a date range. Use for queries like "sales from X to Y", "day to day sales", "daily breakdown"',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate: {
        type: SchemaType.STRING,
        description: 'Start date in YYYY-MM-DD format'
      },
      endDate: {
        type: SchemaType.STRING,
        description: 'End date in YYYY-MM-DD format'
      },
      category: {
        type: SchemaType.STRING,
        description: 'Optional category filter. Examples: Sushi, Beer, Food, Bottle Beer, Signature Rolls'
      }
    },
    required: ['startDate', 'endDate']
  }
}
```

**Hybrid Cache Implementation:**
```typescript
// Step 1: Check insights coverage
const coverage = await this.checkInsightsCoverage(args.startDate, args.endDate);

// Step 2: FAST PATH if fully covered
if (coverage.isFullyCovered) {
  return this.callStoredProcedure(
    'sp_get_daily_summary',
    {
      start_date: args.startDate,
      end_date: args.endDate,
      customer_id: this.customerId,
      primary_category: primaryCategory,
      subcategory: subcategory
    },
    'insights'  // Uses insights dataset
  );
}

// Step 3: SLOW PATH fallback
return this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate,
  end_date: args.endDate,
  primary_category: primaryCategory,
  subcategory: subcategory,
  aggregation: 'SUM',
  group_by_fields: 'date'
});
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:124-182`

---

### 3.2 show_top_items

**Description:** Show top N best-selling items by revenue.

**Parameters:**
```typescript
{
  limit: number;        // Number of items (1-1000) (REQUIRED)
  startDate: string;    // YYYY-MM-DD format (REQUIRED)
  endDate: string;      // YYYY-MM-DD format (REQUIRED)
  category?: string;    // Optional category filter
}
```

**Example Queries:**
- "Top 10 items in July"
- "Best 5 sellers last month"
- "Top 20 Sushi items for June"

**Validation:**
```typescript
if (!Number.isInteger(args.limit) || args.limit < 1) {
  throw new UserInputError(
    'Limit must be a positive integer (minimum 1)',
    UserInputErrorCodes.PARAM_OUT_OF_RANGE,
    { limit: args.limit }
  );
}

if (args.limit > 1000) {
  throw new UserInputError(
    'Limit is too large (maximum 1000)',
    UserInputErrorCodes.PARAM_OUT_OF_RANGE,
    { limit: args.limit }
  );
}
```

**Hybrid Cache Implementation:**
```typescript
// Check insights coverage
const coverage = await this.checkInsightsCoverage(args.startDate, args.endDate);

// FAST PATH: Pre-computed top items
if (coverage.isFullyCovered) {
  return this.callStoredProcedure(
    'sp_get_top_items_from_insights',
    {
      start_date: args.startDate,
      end_date: args.endDate,
      customer_id: this.customerId,
      primary_category: primaryCategory,
      subcategory: subcategory,
      item_limit: args.limit
    },
    'insights'
  );
}

// SLOW PATH: Raw aggregation
return this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate,
  end_date: args.endDate,
  primary_category: primaryCategory,
  subcategory: subcategory,
  aggregation: 'SUM',
  group_by_fields: 'item',
  max_rows: args.limit,
  order_by_field: 'metric_value',
  order_direction: 'DESC'
});
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:186-266`

---

### 3.3 show_category_breakdown

**Description:** Show sales broken down by category.

**Parameters:**
```typescript
{
  startDate: string;      // YYYY-MM-DD format (REQUIRED)
  endDate: string;        // YYYY-MM-DD format (REQUIRED)
  includeBeer?: boolean;  // Include beer categories (default true)
}
```

**Example Queries:**
- "Sales by category for July"
- "Category breakdown last month"
- "Which categories sold most in June"

**Hybrid Cache Implementation:**
```typescript
// Check insights coverage
const coverage = await this.checkInsightsCoverage(args.startDate, args.endDate);

// FAST PATH: Pre-computed category trends
if (coverage.isFullyCovered) {
  return this.callStoredProcedure(
    'sp_get_category_trends',
    {
      start_date: args.startDate,
      end_date: args.endDate,
      customer_id: this.customerId
    },
    'insights'
  );
}

// SLOW PATH: Raw aggregation
return this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate,
  end_date: args.endDate,
  aggregation: 'SUM',
  group_by_fields: 'category',
  max_rows: 100,
  order_by_field: 'metric_value',
  order_direction: 'DESC'
});
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:270-325`

---

### 3.4 get_total_sales

**Description:** Get total sales (single number) for a period.

**Parameters:**
```typescript
{
  startDate: string;    // YYYY-MM-DD format (REQUIRED)
  endDate: string;      // YYYY-MM-DD format (REQUIRED)
  category?: string;    // Optional category filter
}
```

**Example Queries:**
- "Total sales for July"
- "How much did we make last month"
- "Revenue for June in Sushi category"

**Implementation:**
```typescript
const { primaryCategory, subcategory } = await this.parseCategory(args.category);

return this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate,
  end_date: args.endDate,
  primary_category: primaryCategory,
  subcategory: subcategory,
  aggregation: 'SUM',
  group_by_fields: null,  // No grouping = single total
  max_rows: 1,
  order_by_field: 'metric_value',
  order_direction: 'DESC'
});
```

**Note:** Always uses query_metrics (no hybrid cache). Fast because no grouping.

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:329-352`

---

### 3.5 find_peak_day

**Description:** Find the day with highest or lowest sales in a period.

**Parameters:**
```typescript
{
  startDate: string;           // YYYY-MM-DD format (REQUIRED)
  endDate: string;             // YYYY-MM-DD format (REQUIRED)
  category?: string;           // Optional category filter
  type: 'highest' | 'lowest';  // Peak type (REQUIRED)
}
```

**Example Queries:**
- "Best day in July"
- "Worst sales day last month"
- "Highest sales day for Sushi in June"

**Implementation:**
```typescript
const { primaryCategory, subcategory } = await this.parseCategory(args.category);

return this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate,
  end_date: args.endDate,
  primary_category: primaryCategory,
  subcategory: subcategory,
  aggregation: 'SUM',
  group_by_fields: 'date',
  max_rows: 1,  // Only return top result
  order_by_field: 'metric_value',
  order_direction: args.type === 'highest' ? 'DESC' : 'ASC'
});
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:356-380`

---

### 3.6 compare_day_types

**Description:** Compare sales between different day types (weekday vs weekend, or by day of week).

**Parameters:**
```typescript
{
  startDate: string;                              // YYYY-MM-DD format (REQUIRED)
  endDate: string;                                // YYYY-MM-DD format (REQUIRED)
  comparison: 'weekday_vs_weekend' | 'by_day_of_week';  // Comparison type (REQUIRED)
  category?: string;                              // Optional category filter
}
```

**Example Queries:**
- "Weekends vs weekdays in July"
- "Fridays vs Saturdays last month"
- "Compare Monday to Friday sales"

**Implementation:**
```typescript
// Step 1: Get daily data
const dailyData = await this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate,
  end_date: args.endDate,
  primary_category: primaryCategory,
  subcategory: subcategory,
  aggregation: 'SUM',
  group_by_fields: 'date'
});

// Step 2: Check for empty results
if (!dailyData.rows || dailyData.rows.length === 0) {
  throw new UserInputError(
    `No sales data found for the period ${args.startDate} to ${args.endDate}`,
    UserInputErrorCodes.NO_DATA_FOUND,
    { startDate: args.startDate, endDate: args.endDate }
  );
}

// Step 3: Aggregate by day type in application code
const aggregated = this.aggregateByDayType(dailyData.rows, args.comparison);
```

**Aggregation Logic:**
```typescript
private aggregateByDayType(dailyRows: any[], comparison: string): any[] {
  const weekdayTotal = { total: 0, days: 0, dayType: 'Weekday' };
  const weekendTotal = { total: 0, days: 0, dayType: 'Weekend' };

  for (const row of dailyRows) {
    const date = new Date(row.report_date || row.date);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
    const value = parseFloat(row.metric_value || row.total || 0);

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      // Weekend (Saturday or Sunday)
      weekendTotal.total += value;
      weekendTotal.days++;
    } else {
      // Weekday (Monday-Friday)
      weekdayTotal.total += value;
      weekdayTotal.days++;
    }
  }

  // Calculate averages
  const weekdayAvg = weekdayTotal.days > 0 ? weekdayTotal.total / weekdayTotal.days : 0;
  const weekendAvg = weekendTotal.days > 0 ? weekendTotal.total / weekendTotal.days : 0;

  return [
    {
      day_type: 'Weekday',
      total_sales: weekdayTotal.total.toFixed(2),
      average_sales: weekdayAvg.toFixed(2),
      num_days: weekdayTotal.days
    },
    {
      day_type: 'Weekend',
      total_sales: weekendTotal.total.toFixed(2),
      average_sales: weekendAvg.toFixed(2),
      num_days: weekendTotal.days
    }
  ];
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:384-473`

---

### 3.7 track_item_performance

**Description:** Track performance of a specific item over time.

**Parameters:**
```typescript
{
  itemName: string;     // Item name (REQUIRED)
  startDate: string;    // YYYY-MM-DD format (REQUIRED)
  endDate: string;      // YYYY-MM-DD format (REQUIRED)
}
```

**Example Queries:**
- "How is Salmon Roll selling in July"
- "Track Spicy Tuna sales last month"
- "Performance of California Roll in June"

**Implementation:**
```typescript
// Try exact match first
const result = await this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate,
  end_date: args.endDate,
  item_name: args.itemName,
  aggregation: 'SUM',
  group_by_fields: 'date',
  max_rows: 100,
  order_by_field: 'date',
  order_direction: 'ASC'
});

// If no results, try to find similar items
if (result.rows.length === 0) {
  const suggestions = await this.findSimilarItemNames(args.itemName);

  if (suggestions.length > 0) {
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Item not found but suggestions available',
      searchedFor: args.itemName,
      suggestions: suggestions
    }));
  }
}
```

**Similar Items Lookup:**
```typescript
private async findSimilarItemNames(searchTerm: string): Promise<string[]> {
  const query = `
    SELECT DISTINCT item_name
    FROM \`${this.projectId}.${this.dataset}.metrics\`
    WHERE LOWER(item_name) LIKE LOWER(@search_pattern)
    LIMIT 5
  `;

  const [rows] = await this.bqClient.query({
    query,
    params: {
      search_pattern: `%${searchTerm}%`  // Fuzzy match
    },
    location: 'us-central1',
    jobTimeoutMs: 5000
  });

  return rows.map((row: any) => row.item_name);
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:478-560`

---

### 3.8 compare_periods

**Description:** Compare sales between two separate time periods (months, weeks, custom ranges).

**Parameters:**
```typescript
{
  startDate1: string;    // First period start (YYYY-MM-DD) (REQUIRED)
  endDate1: string;      // First period end (YYYY-MM-DD) (REQUIRED)
  startDate2: string;    // Second period start (YYYY-MM-DD) (REQUIRED)
  endDate2: string;      // Second period end (YYYY-MM-DD) (REQUIRED)
  category?: string;     // Optional category filter
  itemName?: string;     // Optional specific item to compare
}
```

**Example Queries:**
- "Compare May and June 2025 sales"
- "May vs June"
- "This month vs last month"
- "Salmon Roll sales April vs May"

**Implementation:**
```typescript
const { primaryCategory, subcategory } = await this.parseCategory(args.category);

return this.callStoredProcedure('query_metrics', {
  metric_name: 'net_sales',
  start_date: args.startDate1,
  end_date: args.endDate1,
  primary_category: primaryCategory,
  subcategory: subcategory,
  item_name: args.itemName || null,
  aggregation: 'SUM',
  group_by_fields: null,
  baseline_start_date: args.startDate2,  // Compare to baseline
  baseline_end_date: args.endDate2,
  max_rows: 1,
  order_by_field: 'metric_value',
  order_direction: 'DESC'
});
```

**Note:** Uses `baseline_start_date` and `baseline_end_date` parameters in query_metrics stored procedure for period comparison.

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:564-590`

---

## 4. Hybrid Cache System

### 4.1 Architecture

```
User Query → Intent Function
                ↓
     Check Insights Coverage
                ↓
    ┌───────────┴───────────┐
    │                       │
FAST PATH             SLOW PATH
Fully Cached          Not Cached
    │                       │
insights.sp_*         query_metrics
    ↓                       ↓
Pre-computed         Raw aggregation
1-2 seconds          4-8 seconds
```

### 4.2 Coverage Checking

**Function:** `checkInsightsCoverage(startDate, endDate)`

**Implementation:**
```typescript
private async checkInsightsCoverage(
  startDate: string,
  endDate: string
): Promise<{ isFullyCovered: boolean; coveragePercent: number }> {
  const query = `
    DECLARE result_table STRING;
    CALL \`${this.projectId}.insights.sp_check_insights_coverage\`(
      DATE('${startDate}'),
      DATE('${endDate}'),
      '${this.customerId}',
      result_table
    );
    EXECUTE IMMEDIATE FORMAT('SELECT is_fully_covered, coverage_percent FROM %s', result_table);
  `;

  const [rows] = await this.bqClient.query({
    query,
    location: 'us-central1',
    jobTimeoutMs: 10000
  });

  const result = rows[0];

  console.log(JSON.stringify({
    severity: 'DEBUG',
    message: 'Checked insights cache coverage',
    startDate,
    endDate,
    isFullyCovered: result.is_fully_covered,
    coveragePercent: result.coverage_percent
  }));

  return {
    isFullyCovered: result.is_fully_covered,
    coveragePercent: parseFloat(result.coverage_percent) || 0
  };
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:774-820`

### 4.3 Fast Path Stored Procedures

**Location:** `insights` dataset in BigQuery

| Stored Procedure | Used By | Purpose |
|-----------------|---------|---------|
| sp_get_daily_summary | show_daily_sales | Daily sales with trends |
| sp_get_top_items_from_insights | show_top_items | Top items per category |
| sp_get_category_trends | show_category_breakdown | Week-over-week category trends |
| sp_check_insights_coverage | All hybrid functions | Check cache availability |

### 4.4 Slow Path Stored Procedure

**Procedure:** `restaurant_analytics.query_metrics`

**Parameters:**
```typescript
{
  metric_name: string;           // 'net_sales', 'quantity_sold', etc.
  start_date: string;            // YYYY-MM-DD
  end_date: string;              // YYYY-MM-DD
  primary_category: string | null;  // '(Beer)', '(Sushi)', null
  subcategory: string | null;    // 'Bottle Beer', 'Signature Rolls', null
  item_name: string | null;      // 'Salmon Roll', null
  aggregation: string;           // 'SUM', 'AVG', 'COUNT'
  group_by_fields: string | null;  // 'date', 'item', 'category', null
  baseline_start_date: string | null;  // For comparisons
  baseline_end_date: string | null;
  max_rows: number;              // Limit results
  order_by_field: string;        // 'metric_value', 'date'
  order_direction: string;       // 'ASC', 'DESC'
}
```

**Why It's Slow:**
- Aggregates raw metrics data on-the-fly
- Joins with reports table for metadata
- Parses JSON dimensions field
- No pre-computation

**Performance:** 4-8 seconds typical

---

## 5. Category Parsing

### 5.1 Category Hierarchy

**Primary Categories (ALWAYS have parentheses):**
- `(Beer)`, `(Sushi)`, `(Food)`, `(Liquor)`, `(Wine)`, `(N/A Beverages)`

**Subcategories (NO parentheses):**
- `Bottle Beer`, `Draft Beer`, `Signature Rolls`, `Classic Rolls`, `Appetizers`, etc.

### 5.2 Smart Category Matching

**Function:** `parseCategory(category?: string)`

```typescript
private async parseCategory(category?: string): Promise<{
  primaryCategory: string | null;
  subcategory: string | null;
}> {
  if (!category) {
    return { primaryCategory: null, subcategory: null };
  }

  // Check if it's already a primary category (in parentheses)
  if (category.startsWith('(') && category.endsWith(')')) {
    return { primaryCategory: category, subcategory: null };
  }

  // Smart matching: check if input matches a known primary category
  const primaryCategories = await this.getPrimaryCategories();
  const normalizedInput = category.toLowerCase().trim();

  for (const primaryCat of primaryCategories) {
    // Remove parentheses for comparison: "(Sushi)" → "sushi"
    const normalizedPrimary = primaryCat.replace(/[()]/g, '').toLowerCase().trim();

    if (normalizedInput === normalizedPrimary) {
      console.log(JSON.stringify({
        severity: 'DEBUG',
        message: 'Smart category match',
        input: category,
        matched: primaryCat
      }));
      return { primaryCategory: primaryCat, subcategory: null };
    }
  }

  // Otherwise it's a subcategory
  return { primaryCategory: null, subcategory: category };
}
```

**Examples:**
- Input: `"Sushi"` → Primary: `"(Sushi)"`, Sub: `null`
- Input: `"(Beer)"` → Primary: `"(Beer)"`, Sub: `null`
- Input: `"Bottle Beer"` → Primary: `null`, Sub: `"Bottle Beer"`

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:738-770`

### 5.3 Primary Categories Cache

**Function:** `getPrimaryCategories()`

```typescript
private async getPrimaryCategories(): Promise<string[]> {
  if (this.primaryCategoriesCache) {
    return this.primaryCategoriesCache;
  }

  const query = `
    SELECT DISTINCT primary_category
    FROM \`${this.projectId}.${this.dataset}.metrics\`
    WHERE primary_category LIKE '(%'  -- Only categories in parentheses
    ORDER BY primary_category
  `;

  const [rows] = await this.bqClient.query({
    query,
    location: 'us-central1',
    jobTimeoutMs: 5000
  });

  this.primaryCategoriesCache = rows.map((row: any) => row.primary_category);

  console.log(JSON.stringify({
    severity: 'DEBUG',
    message: 'Primary categories cached',
    count: this.primaryCategoriesCache.length
  }));

  return this.primaryCategoriesCache;
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:698-731`

---

## 6. Date Availability Caching

### 6.1 Latest Available Date

**Function:** `getLatestAvailableDate()`

```typescript
async getLatestAvailableDate(): Promise<string | null> {
  if (this.latestDateCache) {
    return this.latestDateCache;
  }

  const query = `
    SELECT MAX(report_date) as latest_date
    FROM \`${this.projectId}.${this.dataset}.reports\`
    WHERE customer_id = @customer_id
  `;

  const [rows] = await this.bqClient.query({
    query,
    params: { customer_id: this.customerId },
    location: 'us-central1',
    jobTimeoutMs: 5000
  });

  if (rows && rows.length > 0 && rows[0].latest_date) {
    this.latestDateCache = this.formatBigQueryDate(rows[0].latest_date);
    return this.latestDateCache;
  }

  return null;
}
```

**Used in:** System instruction building (ResponseGenerator.ts:229-254)

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:594-631`

### 6.2 First Available Date

**Function:** `getFirstAvailableDate()`

```typescript
async getFirstAvailableDate(): Promise<string | null> {
  if (this.firstDateCache) {
    return this.firstDateCache;
  }

  const query = `
    SELECT MIN(report_date) as first_date
    FROM \`${this.projectId}.${this.dataset}.reports\`
    WHERE customer_id = @customer_id
  `;

  const [rows] = await this.bqClient.query({
    query,
    params: { customer_id: this.customerId },
    location: 'us-central1',
    jobTimeoutMs: 5000
  });

  if (rows && rows.length > 0 && rows[0].first_date) {
    this.firstDateCache = this.formatBigQueryDate(rows[0].first_date);
    return this.firstDateCache;
  }

  return null;
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:636-672`

---

## 7. Error Handling

### 7.1 User Input Errors

**Thrown when:**
- Invalid parameters (e.g., limit out of range)
- Unknown function name
- No data found for query
- Invalid category name

**Example:**
```typescript
if (!Number.isInteger(args.limit) || args.limit < 1) {
  throw new UserInputError(
    'Limit must be a positive integer (minimum 1)',
    UserInputErrorCodes.PARAM_OUT_OF_RANGE,
    { limit: args.limit },
    ['Try a value between 1 and 100', 'Example: limit=10 for top 10 items']
  );
}
```

**Error Code:** `UserInputErrorCodes.PARAM_OUT_OF_RANGE`

### 7.2 Transient Errors

**Thrown when:**
- Query timeout (>30 seconds)
- BigQuery rate limit exceeded
- Service unavailable

**Example:**
```typescript
if (errorMessage.includes('timeout') || errorMessage.includes('deadline exceeded')) {
  throw new TransientError(
    'Query took too long to execute. Try narrowing your date range or filters.',
    TransientErrorCodes.NETWORK_TIMEOUT,
    {
      procedureName,
      params,
      executionTimeMs: Date.now() - startTime
    },
    5000 // Suggest retrying after 5 seconds
  );
}
```

**Error Code:** `TransientErrorCodes.NETWORK_TIMEOUT`

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:868-922`

---

## 8. Execution Flow

### 8.1 High-Level Flow

```
1. Gemini chooses intent function
   ↓
2. ResponseGenerator.ts calls AnalyticsToolHandler.execute()
   ↓
3. AnalyticsToolHandler routes to specific function
   ↓
4. Function checks hybrid cache (if applicable)
   ↓
5. Calls BigQuery stored procedure
   ↓
6. Returns ToolResult to ResponseGenerator
   ↓
7. Gemini generates natural language response
```

### 8.2 AnalyticsToolHandler.execute()

**Entry Point:**
```typescript
async execute(functionName: string, args: Record<string, any>): Promise<ToolResult> {
  const startTime = Date.now();

  // Log function call
  console.log(JSON.stringify({
    severity: 'DEBUG',
    message: 'AnalyticsToolHandler.execute() called',
    functionName,
    args,
    customerId: this.customerId
  }));

  try {
    let result: ToolResult;

    switch (functionName) {
      case 'show_daily_sales':
        result = await this.showDailySales(args as any);
        break;
      case 'show_top_items':
        result = await this.showTopItems(args as any);
        break;
      case 'show_category_breakdown':
        result = await this.showCategoryBreakdown(args as any);
        break;
      case 'get_total_sales':
        result = await this.getTotalSales(args as any);
        break;
      case 'find_peak_day':
        result = await this.findPeakDay(args as any);
        break;
      case 'compare_day_types':
        result = await this.compareDayTypes(args as any);
        break;
      case 'track_item_performance':
        result = await this.trackItemPerformance(args as any);
        break;
      case 'compare_periods':
        result = await this.comparePeriods(args as any);
        break;
      default:
        throw new UserInputError(
          `Unknown function: ${functionName}`,
          UserInputErrorCodes.MISSING_REQUIRED_PARAM,
          { functionName }
        );
    }

    // Log successful execution
    console.log(JSON.stringify({
      severity: 'INFO',
      message: 'Intent function executed successfully',
      function: functionName,
      executionTimeMs: Date.now() - startTime,
      rowCount: result.totalRows
    }));

    return result;
  } catch (error: any) {
    // Log and re-throw
    console.error(JSON.stringify({
      severity: 'ERROR',
      message: 'Intent function execution failed',
      function: functionName,
      args,
      errorMessage: error.message || String(error),
      executionTimeMs: Date.now() - startTime
    }));

    throw error;
  }
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:36-119`

### 8.3 ToolResult Interface

```typescript
export interface ToolResult {
  rows: any[];             // Result rows from BigQuery
  totalRows: number;       // Number of rows returned
  executionTimeMs: number; // Execution time in milliseconds
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:7-11`

---

## 9. BigQuery Stored Procedure Call Pattern

### 9.1 Generic Call Method

**Function:** `callStoredProcedure(procedureName, params, dataset)`

```typescript
private async callStoredProcedure(
  procedureName: string,
  params: Record<string, any>,
  dataset: string = this.dataset
): Promise<ToolResult> {
  const startTime = Date.now();

  // Build CALL statement
  const paramNames = Object.keys(params);
  const paramPlaceholders = paramNames.map(name => `@${name}`).join(', ');

  const callStatement = `
    DECLARE result_table STRING;
    CALL \`${this.projectId}.${dataset}.${procedureName}\`(
      ${paramPlaceholders},
      result_table
    );
    EXECUTE IMMEDIATE FORMAT('SELECT * FROM %s', result_table);
  `;

  // Build type map for null values
  const types: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null) {
      types[key] = 'STRING';  // All our null params are strings
    }
  }

  // Execute query with parameters
  const [rows] = await this.bqClient.query({
    query: callStatement,
    params: params,
    types: types,
    location: 'us-central1',
    jobTimeoutMs: 30000
  });

  return {
    rows,
    totalRows: rows.length,
    executionTimeMs: Date.now() - startTime
  };
}
```

**File:** `services/response-engine/src/tools/AnalyticsToolHandler.ts:825-867`

### 9.2 Why Use Stored Procedures?

**Security:**
- Prevents SQL injection via parameterized calls
- No raw SQL construction in application code
- Stored procedures use FORMAT() with @variables

**Maintainability:**
- Complex query logic in one place (BigQuery)
- Can update queries without redeploying services
- Easier to test and optimize

**Performance:**
- Query execution plan caching
- Reduced network overhead
- BigQuery-native optimizations

---

## 10. Testing

### 10.1 Test Coverage

**Test File:** `scripts/testing/test-queries-isolated-flat.json`

**Format:**
```json
[
  {
    "function": "compare_periods",
    "queries": [
      {
        "query": "compare May and June 2025 sales",
        "expected": "compare_periods called with two date ranges"
      },
      {
        "query": "how did Spicy Tuna perform April vs May 2025",
        "expected": "compare_periods called with itemName parameter"
      }
    ]
  },
  {
    "function": "find_peak_day",
    "queries": [
      {
        "query": "what was our best day in July 2025",
        "expected": "find_peak_day called with type=highest"
      },
      {
        "query": "worst sales day last month",
        "expected": "find_peak_day called with type=lowest"
      }
    ]
  }
]
```

### 10.2 Test Execution

**Command:**
```bash
./scripts/testing/test-all-intent-functions.sh --test-file test-queries-isolated-flat.json --mode isolated
```

**Validation:**
- Claude CLI validates response matches expected function call
- Checks parameter extraction accuracy
- Verifies natural language response quality

**Current Success Rate:** 93.3% (28/30 tests passing)

---

## 11. Performance Benchmarks

### 11.1 Typical Response Times

| Function | Cache Hit | Cache Miss |
|----------|-----------|------------|
| show_daily_sales | 1-2s | 4-6s |
| show_top_items | 1-2s | 5-7s |
| show_category_breakdown | 1-2s | 4-6s |
| get_total_sales | N/A | 2-3s |
| find_peak_day | N/A | 3-4s |
| compare_day_types | N/A | 4-5s |
| track_item_performance | N/A | 3-5s |
| compare_periods | N/A | 3-4s |

### 11.2 Cache Hit Rate

**Target:** 80% of queries hit insights cache

**Current (October 2025):**
- Insights cache covers: April 1, 2025 - October 20, 2025
- Daily insights generation: 3am CT via Cloud Scheduler
- Coverage: ~200 days of pre-computed data

### 11.3 Optimization Tips

**For faster queries:**
1. Query date ranges within insights coverage (check latest_date)
2. Avoid very wide date ranges (>90 days) on slow path
3. Use specific categories instead of all categories
4. Limit top_items to ≤20 for faster results

---

## 12. Future Enhancements

### 12.1 Potential New Functions

**Under consideration:**
- `show_hourly_sales` - Intraday sales patterns
- `forecast_sales` - Predictive analytics using ML models
- `detect_anomalies` - Automated anomaly detection
- `compare_items` - Side-by-side item comparison
- `analyze_trends` - Trend analysis with statistical significance

### 12.2 Cache Improvements

**Ideas:**
- Real-time insights updates (currently daily at 3am)
- Partial cache hits (use cache for covered dates, query for rest)
- Category-specific caching strategies
- Intelligent pre-warming based on query patterns

### 12.3 Multi-Tenancy

**Required changes for multi-tenant:**
- Add tenant_id filter to all stored procedure calls
- Per-tenant insights cache
- Tenant-specific category hierarchies
- Isolated test environments per tenant

---

**Document Version:** 1.0
**Last Updated:** October 30, 2025
**Implementation:** services/response-engine/src/tools/AnalyticsToolHandler.ts
