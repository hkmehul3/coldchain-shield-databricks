# ColdChainShield — Cold-Chain Spoilage & Batch Recall Risk Engine (Databricks + Delta Lake)

An end-to-end **Databricks Free Edition & Delta Lake** Medallion lakehouse that detects thermal excursions across refrigerated pharmaceutical and perishable food transit, computes cumulative batch spoilage exposure, ranks high-risk lots for immediate quarantine/recall, and preserves full Delta Lake audit/time-travel history.

## Architecture (Bronze -> Silver -> Gold)
1. **Synthetic Telemetry Generator (`notebooks/01_generate_bronze_telemetry.py`):**
   - Generates realistic multi-shipment IoT logger data across `BIOLOGICS_2_8C` (vaccines/insulin), `FROZEN_PHARMA` (`-25°C` to `-15°C`), and `PERISHABLE_DAIRY` (`0°C` to `4°C`), including out-of-order late packets, duplicate retransmissions, and simulated reefer compressor failures.
2. **Delta Silver Layer (`notebooks/02_silver_thermal_excursions.py`):**
   - Uses Spark Connect–compatible DataFrame APIs (no RDD calls, no `.cache()`, compatible with Databricks Free Edition serverless compute).
   - Deduplicates retransmitted logger readings by `reading_id`, evaluates product-specific safe thermal thresholds, computes per-reading breach severity and cumulative excursion minutes per batch lot, and runs an **ACID Delta `MERGE`** upsert with **Change Data Feed (CDF)** enabled.
3. **Delta Gold Layer & Recall Watchlist (`sql/03_gold_recall_and_lane_analytics.sql`):**
   - Materializes `gold_batch_recall_watch` (prioritizing lots for quarantine based on excursion duration, peak temperature breach, and affected clinics/hubs) and `gold_lane_reliability` (identifying failing refrigerated transit routes/carriers).
   - Demonstrates Delta Lake `OPTIMIZE`, `DESCRIBE HISTORY`, and time-travel auditing (`VERSION AS OF`).
4. **Control Plane UI (`frontend/`):**
   - Interactive React + Vite + Tailwind CSS dashboard (`ColdChainShield`) to inspect batch recall priorities, simulate thermal threshold rules, and review Delta Lake audit history.
