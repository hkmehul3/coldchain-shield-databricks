# Databricks notebook source
# MAGIC %md
# MAGIC # 02 - ColdChainShield: Silver Thermal Excursion Engine (Delta Lake MERGE + CDF)
# MAGIC - Uses Spark Connect-safe DataFrame APIs (compatible with Databricks Free Edition serverless compute).
# MAGIC - Deduplicates retransmitted logger readings by `reading_id`.
# MAGIC - Evaluates category-specific thermal thresholds (`BIOLOGICS_2_8C`, `FROZEN_PHARMA`, `PERISHABLE_DAIRY`).
# MAGIC - Upserts into `main.coldchain_shield.silver_thermal_excursions` using Delta ACID `MERGE` with Change Data Feed enabled.

# COMMAND ----------

from delta.tables import DeltaTable
from pyspark.sql import SparkSession, Window
from pyspark.sql import functions as F

spark = SparkSession.builder.appName("ColdChainShield-SilverDelta").getOrCreate()

CATALOG = "main"
SCHEMA = "coldchain_shield"
BRONZE_TABLE = f"{CATALOG}.{SCHEMA}.bronze_sensor_readings"
SILVER_TABLE = f"{CATALOG}.{SCHEMA}.silver_thermal_excursions"

raw_df = spark.table(BRONZE_TABLE)

# 1. Cleanse physical sensor outliers and deduplicate retransmitted packets
dedup_window = Window.partitionBy("reading_id").orderBy(
    F.col("recorded_at").desc(),
    F.col("ingested_at").desc(),
)

clean_df = (
    raw_df.filter(F.col("reading_id").isNotNull() & F.col("batch_lot_id").isNotNull())
    .filter((F.col("temp_celsius") >= F.lit(-80.0)) & (F.col("temp_celsius") <= F.lit(60.0)))
    .withColumn("rn", F.row_number().over(dedup_window))
    .filter(F.col("rn") == 1)
    .drop("rn")
)

# 2. Apply product-category thermal rules
enriched_df = (
    clean_df.withColumn(
        "min_safe_temp_c",
        F.when(F.col("product_category") == "BIOLOGICS_2_8C", F.lit(2.0))
        .when(F.col("product_category") == "FROZEN_PHARMA", F.lit(-25.0))
        .when(F.col("product_category") == "PERISHABLE_DAIRY", F.lit(0.0))
        .otherwise(F.lit(2.0)),
    )
    .withColumn(
        "max_safe_temp_c",
        F.when(F.col("product_category") == "BIOLOGICS_2_8C", F.lit(8.0))
        .when(F.col("product_category") == "FROZEN_PHARMA", F.lit(-15.0))
        .when(F.col("product_category") == "PERISHABLE_DAIRY", F.lit(4.0))
        .otherwise(F.lit(8.0)),
    )
    .withColumn(
        "temp_deviation_c",
        F.when(F.col("temp_celsius") > F.col("max_safe_temp_c"), F.round(F.col("temp_celsius") - F.col("max_safe_temp_c"), 2))
        .when(F.col("temp_celsius") < F.col("min_safe_temp_c"), F.round(F.col("min_safe_temp_c") - F.col("temp_celsius"), 2))
        .otherwise(F.lit(0.0)),
    )
    .withColumn("is_thermal_excursion", F.col("temp_deviation_c") > F.lit(0.0))
    # Each logger interval represents 15 minutes of exposure
    .withColumn(
        "excursion_minutes",
        F.when(F.col("is_thermal_excursion"), F.lit(15)).otherwise(F.lit(0)),
    )
    .withColumn(
        "record_hash",
        F.sha2(
            F.concat_ws(
                "|",
                F.col("reading_id"),
                F.col("batch_lot_id"),
                F.col("temp_celsius").cast("string"),
                F.col("recorded_at").cast("string"),
            ),
            256,
        ),
    )
)

# 3. Create Silver Delta table with Change Data Feed enabled, or execute ACID MERGE
if not spark.catalog.tableExists(SILVER_TABLE):
    (
        enriched_df.write.format("delta")
        .option("delta.enableChangeDataFeed", "true")
        .saveAsTable(SILVER_TABLE)
    )
else:
    silver_delta = DeltaTable.forName(spark, SILVER_TABLE)
    (
        silver_delta.alias("t")
        .merge(enriched_df.alias("s"), "t.reading_id = s.reading_id")
        .whenMatchedUpdate(
            condition="s.record_hash <> t.record_hash",
            set={
                "shipment_id": "s.shipment_id",
                "batch_lot_id": "s.batch_lot_id",
                "product_category": "s.product_category",
                "carrier": "s.carrier",
                "transit_lane": "s.transit_lane",
                "destination_hub": "s.destination_hub",
                "temp_celsius": "s.temp_celsius",
                "humidity_pct": "s.humidity_pct",
                "recorded_at": "s.recorded_at",
                "ingested_at": "s.ingested_at",
                "min_safe_temp_c": "s.min_safe_temp_c",
                "max_safe_temp_c": "s.max_safe_temp_c",
                "temp_deviation_c": "s.temp_deviation_c",
                "is_thermal_excursion": "s.is_thermal_excursion",
                "excursion_minutes": "s.excursion_minutes",
                "record_hash": "s.record_hash",
            },
        )
        .whenNotMatchedInsertAll()
        .execute()
    )

# 4. Compact small files & inspect Delta transaction history
spark.sql(f"OPTIMIZE {SILVER_TABLE}")
spark.sql(f"DESCRIBE HISTORY {SILVER_TABLE} LIMIT 5").show(truncate=False)
