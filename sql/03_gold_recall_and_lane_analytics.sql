-- ColdChainShield Gold Analytics & Delta Governance SQL (Databricks SQL / Notebook)

CREATE SCHEMA IF NOT EXISTS main.coldchain_shield;

-- 1. Gold Batch Quarantine & Recall Watchlist
CREATE OR REPLACE TABLE main.coldchain_shield.gold_batch_recall_watch AS
SELECT
  batch_lot_id,
  product_category,
  shipment_id,
  carrier,
  transit_lane,
  destination_hub,
  COUNT(*) AS total_sensor_packets,
  SUM(excursion_minutes) AS cumulative_excursion_minutes,
  MAX(temp_celsius) AS peak_recorded_temp_c,
  MAX(temp_deviation_c) AS max_threshold_breach_c,
  CASE
    WHEN SUM(excursion_minutes) >= 180 OR MAX(temp_deviation_c) >= 5.0 THEN 'QUARANTINE_IMMEDIATE'
    WHEN SUM(excursion_minutes) >= 45 OR MAX(temp_deviation_c) >= 2.0 THEN 'QA_HOLD_INSPECT'
    ELSE 'RELEASE_APPROVED'
  END AS recall_disposition,
  CURRENT_TIMESTAMP() AS evaluated_at
FROM main.coldchain_shield.silver_thermal_excursions
GROUP BY
  batch_lot_id,
  product_category,
  shipment_id,
  carrier,
  transit_lane,
  destination_hub;

-- 2. Gold Carrier & Transit Lane Reliability Mart
CREATE OR REPLACE TABLE main.coldchain_shield.gold_lane_reliability AS
SELECT
  carrier,
  transit_lane,
  COUNT(DISTINCT shipment_id) AS shipments_monitored,
  SUM(excursion_minutes) AS total_excursion_minutes,
  ROUND(
    100.0 * SUM(CASE WHEN NOT is_thermal_excursion THEN 1 ELSE 0 END) / COUNT(*),
    2
  ) AS thermal_compliance_pct
FROM main.coldchain_shield.silver_thermal_excursions
GROUP BY carrier, transit_lane
ORDER BY thermal_compliance_pct ASC;

-- 3. Inspect Watchlist & Delta Time Travel Audit Trail
SELECT *
FROM main.coldchain_shield.gold_batch_recall_watch
ORDER BY cumulative_excursion_minutes DESC;

DESCRIBE HISTORY main.coldchain_shield.silver_thermal_excursions;
