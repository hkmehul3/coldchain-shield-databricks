# Databricks notebook source
# MAGIC %md
# MAGIC # 01 - ColdChainShield: Bronze Telemetry Ingestion (Databricks Free Edition)
# MAGIC Generates synthetic cold-chain logger readings (including duplicate packets & thermal excursions)
# MAGIC and writes to a Unity Catalog Delta table (`main.coldchain_shield.bronze_sensor_readings`).

# COMMAND ----------

import random
from datetime import datetime, timedelta
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import (
    DoubleType,
    StringType,
    StructField,
    StructType,
    TimestampType,
)

spark = SparkSession.builder.appName("ColdChainShield-BronzeIngest").getOrCreate()

CATALOG = "main"
SCHEMA = "coldchain_shield"
BRONZE_TABLE = f"{CATALOG}.{SCHEMA}.bronze_sensor_readings"

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")

SHIPMENTS = [
    # (shipment_id, batch_lot_id, product_category, carrier, lane, destination_hub, base_temp, breach_mode)
    ("SHP-9001", "LOT-VAC-2026A", "BIOLOGICS_2_8C", "ArcticExpress", "BOM -> DEL", "HUB-DEL-MED01", 4.5, "COMPRESSOR_DRIFT"),
    ("SHP-9002", "LOT-INS-2026B", "BIOLOGICS_2_8C", "NordicCold", "FRA -> MUC", "HUB-MUC-CLINIC04", 5.1, "NORMAL"),
    ("SHP-9003", "LOT-FRZ-2026C", "FROZEN_PHARMA", "PolarFreight", "BLR -> HYD", "HUB-HYD-BIO02", -20.0, "DOOR_AJAR_SPIKE"),
    ("SHP-9004", "LOT-DRY-2026D", "PERISHABLE_DAIRY", "FreshHaul", "PUN -> BOM", "HUB-BOM-RETAIL09", 2.2, "NORMAL"),
    ("SHP-9005", "LOT-VAC-2026E", "BIOLOGICS_2_8C", "ArcticExpress", "CCU -> IXR", "HUB-IXR-DIST03", 4.8, "SEVERE_EXCURSION"),
]

random.seed(42)
start_time = datetime(2026, 11, 24, 6, 0, 0)
records = []

for shp_id, lot_id, category, carrier, lane, hub, base_temp, mode in SHIPMENTS:
    for step in range(48):  # 48 intervals x 15 mins = 12 hours of transit
        recorded_at = start_time + timedelta(minutes=15 * step)
        # Simulate late arrival jitter (0 to 40 mins)
        ingested_at = recorded_at + timedelta(minutes=random.randint(1, 40))

        temp = base_temp + random.uniform(-0.6, 0.6)
        if mode == "COMPRESSOR_DRIFT" and 20 <= step <= 32:
            temp = 9.4 + random.uniform(0.0, 2.1)  # Exceeds 8.0C ceiling for >3 hours
        elif mode == "DOOR_AJAR_SPIKE" and 14 <= step <= 17:
            temp = -11.2 + random.uniform(-0.5, 1.0)  # Exceeds -15.0C ceiling for 1 hour
        elif mode == "SEVERE_EXCURSION" and step >= 28:
            temp = 13.8 + random.uniform(0.2, 2.8)  # Sustained high temp breach

        reading_id = f"{shp_id}-R{step:03d}"
        row = (
            reading_id,
            shp_id,
            lot_id,
            category,
            carrier,
            lane,
            hub,
            round(temp, 2),
            round(random.uniform(45.0, 68.0), 1),
            recorded_at,
            ingested_at,
        )
        records.append(row)

        # Inject ~8% duplicate retransmitted packets with slightly later ingest_timestamp
        if step % 12 == 0:
            records.append(
                (
                    reading_id,
                    shp_id,
                    lot_id,
                    category,
                    carrier,
                    lane,
                    hub,
                    round(temp, 2),
                    round(random.uniform(45.0, 68.0), 1),
                    recorded_at,
                    ingested_at + timedelta(minutes=5),
                )
            )

schema = StructType(
    [
        StructField("reading_id", StringType(), False),
        StructField("shipment_id", StringType(), False),
        StructField("batch_lot_id", StringType(), False),
        StructField("product_category", StringType(), False),
        StructField("carrier", StringType(), False),
        StructField("transit_lane", StringType(), False),
        StructField("destination_hub", StringType(), False),
        StructField("temp_celsius", DoubleType(), False),
        StructField("humidity_pct", DoubleType(), True),
        StructField("recorded_at", TimestampType(), False),
        StructField("ingested_at", TimestampType(), False),
    ]
)

bronze_df = spark.createDataFrame(records, schema=schema)

(
    bronze_df.write.format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(BRONZE_TABLE)
)

print(f"Wrote {bronze_df.count()} raw bronze rows to {BRONZE_TABLE}")
