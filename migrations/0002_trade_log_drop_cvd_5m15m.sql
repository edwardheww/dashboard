-- Trade log: drop CVD and the 5m/15m chart field, rename the 1m chart
-- field to a single generic "chart" field.
ALTER TABLE trade_log DROP COLUMN cvd;
ALTER TABLE trade_log DROP COLUMN chart_5m_15m;
ALTER TABLE trade_log RENAME COLUMN chart_1m TO chart;
