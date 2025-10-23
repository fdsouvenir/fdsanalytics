#!/bin/bash
# Seed Test Data
# Populates test BigQuery dataset with sample data

set -e

PROJECT_ID="${PROJECT_ID:-fdsanalytics-test}"

echo "Seeding test data for project: $PROJECT_ID"

# Seed reports
echo "Seeding reports..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
INSERT INTO \`${PROJECT_ID}.restaurant_analytics.reports\`
(report_id, report_date, business_date, pdf_filename, report_type, location_name, location_id, source, schema_version)
VALUES
  ('2025-10-22-test-001', DATE('2025-10-22'), DATE('2025-10-22'), 'test-2025-10-22.pdf', 'pmix', 'Test Restaurant', 'test-001', 'test', '1.0'),
  ('2025-10-21-test-001', DATE('2025-10-21'), DATE('2025-10-21'), 'test-2025-10-21.pdf', 'pmix', 'Test Restaurant', 'test-001', 'test', '1.0'),
  ('2025-10-20-test-001', DATE('2025-10-20'), DATE('2025-10-20'), 'test-2025-10-20.pdf', 'pmix', 'Test Restaurant', 'test-001', 'test', '1.0'),
  ('2025-10-15-test-001', DATE('2025-10-15'), DATE('2025-10-15'), 'test-2025-10-15.pdf', 'pmix', 'Test Restaurant', 'test-001', 'test', '1.0'),
  ('2025-10-14-test-001', DATE('2025-10-14'), DATE('2025-10-14'), 'test-2025-10-14.pdf', 'pmix', 'Test Restaurant', 'test-001', 'test', '1.0');
EOF

# Seed metrics
echo "Seeding metrics..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
INSERT INTO \`${PROJECT_ID}.restaurant_analytics.metrics\`
(metric_id, report_id, metric_name, metric_value, primary_category, dimensions)
VALUES
  -- Oct 22 data
  ('2025-10-22-test-001-001', '2025-10-22-test-001', 'net_sales', '1234.56', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}'),
  ('2025-10-22-test-001-002', '2025-10-22-test-001', 'quantity_sold', '50', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}'),
  ('2025-10-22-test-001-003', '2025-10-22-test-001', 'net_sales', '2345.67', '(Sushi)', JSON '{"category": "Signature Rolls", "item_name": "Spicy Tuna Roll"}'),
  ('2025-10-22-test-001-004', '2025-10-22-test-001', 'quantity_sold', '85', '(Sushi)', JSON '{"category": "Signature Rolls", "item_name": "Spicy Tuna Roll"}'),
  ('2025-10-22-test-001-005', '2025-10-22-test-001', 'net_sales', '1876.43', '(Food)', JSON '{"category": "Starters", "item_name": "Edamame"}'),
  ('2025-10-22-test-001-006', '2025-10-22-test-001', 'quantity_sold', '62', '(Food)', JSON '{"category": "Starters", "item_name": "Edamame"}'),

  -- Oct 21 data
  ('2025-10-21-test-001-001', '2025-10-21-test-001', 'net_sales', '1123.45', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}'),
  ('2025-10-21-test-001-002', '2025-10-21-test-001', 'quantity_sold', '45', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}'),
  ('2025-10-21-test-001-003', '2025-10-21-test-001', 'net_sales', '2123.45', '(Sushi)', JSON '{"category": "Signature Rolls", "item_name": "Spicy Tuna Roll"}'),
  ('2025-10-21-test-001-004', '2025-10-21-test-001', 'quantity_sold', '78', '(Sushi)', JSON '{"category": "Signature Rolls", "item_name": "Spicy Tuna Roll"}'),
  ('2025-10-21-test-001-005', '2025-10-21-test-001', 'net_sales', '1576.55', '(Food)', JSON '{"category": "Starters", "item_name": "Edamame"}'),
  ('2025-10-21-test-001-006', '2025-10-21-test-001', 'quantity_sold', '55', '(Food)', JSON '{"category": "Starters", "item_name": "Edamame"}'),

  -- Oct 20 data
  ('2025-10-20-test-001-001', '2025-10-20-test-001', 'net_sales', '1432.10', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}'),
  ('2025-10-20-test-001-002', '2025-10-20-test-001', 'quantity_sold', '58', '(Beer)', JSON '{"category": "Draft Beer", "item_name": "IPA"}'),
  ('2025-10-20-test-001-003', '2025-10-20-test-001', 'net_sales', '2532.88', '(Sushi)', JSON '{"category": "Signature Rolls", "item_name": "Spicy Tuna Roll"}'),
  ('2025-10-20-test-001-004', '2025-10-20-test-001', 'quantity_sold', '92', '(Sushi)', JSON '{"category": "Signature Rolls", "item_name": "Spicy Tuna Roll"}');
EOF

# Seed conversation history
echo "Seeding conversation history..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
INSERT INTO \`${PROJECT_ID}.chat_history.conversations\`
(message_id, workspace_id, thread_id, user_id, message_text, message_type, timestamp)
VALUES
  ('msg-test-001', 'test-workspace', 'thread-test-001', 'user@test.com', 'How are sales today?', 'user', TIMESTAMP('2025-10-22 10:00:00')),
  ('msg-test-002', 'test-workspace', 'thread-test-001', 'bot', 'Today sales are \$5,456.66', 'bot', TIMESTAMP('2025-10-22 10:00:05')),
  ('msg-test-003', 'test-workspace', 'thread-test-001', 'user@test.com', 'What about beer?', 'user', TIMESTAMP('2025-10-22 10:01:00')),
  ('msg-test-004', 'test-workspace', 'thread-test-001', 'bot', 'Beer sales are \$1,234.56', 'bot', TIMESTAMP('2025-10-22 10:01:05'));
EOF

# Seed insights
echo "Seeding insights..."
bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
INSERT INTO \`${PROJECT_ID}.insights.daily_comparisons\`
(report_date, day_of_week, total_sales, avg_for_day_of_week, deviation_percent, is_anomaly)
VALUES
  (DATE('2025-10-22'), 'Tuesday', 5456.66, 5200.00, 4.94, FALSE),
  (DATE('2025-10-21'), 'Monday', 4823.45, 4800.00, 0.49, FALSE),
  (DATE('2025-10-20'), 'Sunday', 3964.98, 4500.00, -11.89, FALSE);
EOF

bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
INSERT INTO \`${PROJECT_ID}.insights.category_trends\`
(primary_category, current_week_sales, last_week_sales, percent_change, trend_direction)
VALUES
  ('(Beer)', 8645.23, 7832.11, 10.38, 'up'),
  ('(Sushi)', 16432.89, 14876.45, 10.46, 'up'),
  ('(Food)', 13145.67, 15234.22, -13.71, 'down');
EOF

bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
INSERT INTO \`${PROJECT_ID}.insights.top_items\`
(primary_category, item_name, total_sales, total_quantity, rank)
VALUES
  ('(Beer)', 'IPA', 3789.11, 153, 1),
  ('(Beer)', 'Lager', 2456.12, 98, 2),
  ('(Sushi)', 'Spicy Tuna Roll', 7123.45, 255, 1),
  ('(Sushi)', 'California Roll', 5432.88, 198, 2);
EOF

bq query --use_legacy_sql=false --project_id=$PROJECT_ID <<EOF
INSERT INTO \`${PROJECT_ID}.insights.daily_forecast\`
(forecast_date, predicted_sales, lower_bound, upper_bound, confidence_level)
VALUES
  (DATE('2025-10-23'), 5234.12, 4800.00, 5650.00, 'medium'),
  (DATE('2025-10-24'), 5456.78, 5000.00, 5900.00, 'medium'),
  (DATE('2025-10-25'), 6789.45, 6200.00, 7350.00, 'high'),
  (DATE('2025-10-26'), 7123.88, 6500.00, 7750.00, 'high'),
  (DATE('2025-10-27'), 6234.56, 5700.00, 6800.00, 'medium'),
  (DATE('2025-10-28'), 4876.33, 4400.00, 5350.00, 'medium'),
  (DATE('2025-10-29'), 4123.45, 3700.00, 4550.00, 'low');
EOF

echo ""
echo "Test data seeding complete!"
echo "You can now run integration tests against project: $PROJECT_ID"
