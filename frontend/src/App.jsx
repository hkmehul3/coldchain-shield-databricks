import React, { useState, useMemo } from 'react';
import {
  ThermometerSnowflake,
  AlertOctagon,
  CheckCircle2,
  Clock,
  Truck,
  History,
  ShieldAlert,
} from 'lucide-react';

const BATCH_WATCHLIST = [
  {
    batch_lot_id: 'LOT-VAC-2026E',
    product_category: 'BIOLOGICS_2_8C',
    shipment_id: 'SHP-9005',
    carrier: 'ArcticExpress',
    transit_lane: 'CCU -> IXR',
    destination_hub: 'HUB-IXR-DIST03',
    cumulative_excursion_minutes: 300,
    peak_recorded_temp_c: 16.4,
    max_threshold_breach_c: 8.4,
    disposition: 'QUARANTINE_IMMEDIATE',
  },
  {
    batch_lot_id: 'LOT-VAC-2026A',
    product_category: 'BIOLOGICS_2_8C',
    shipment_id: 'SHP-9001',
    carrier: 'ArcticExpress',
    transit_lane: 'BOM -> DEL',
    destination_hub: 'HUB-DEL-MED01',
    cumulative_excursion_minutes: 195,
    peak_recorded_temp_c: 11.3,
    max_threshold_breach_c: 3.3,
    disposition: 'QUARANTINE_IMMEDIATE',
  },
  {
    batch_lot_id: 'LOT-FRZ-2026C',
    product_category: 'FROZEN_PHARMA',
    shipment_id: 'SHP-9003',
    carrier: 'PolarFreight',
    transit_lane: 'BLR -> HYD',
    destination_hub: 'HUB-HYD-BIO02',
    cumulative_excursion_minutes: 60,
    peak_recorded_temp_c: -10.5,
    max_threshold_breach_c: 4.5,
    disposition: 'QA_HOLD_INSPECT',
  },
  {
    batch_lot_id: 'LOT-INS-2026B',
    product_category: 'BIOLOGICS_2_8C',
    shipment_id: 'SHP-9002',
    carrier: 'NordicCold',
    transit_lane: 'FRA -> MUC',
    destination_hub: 'HUB-MUC-CLINIC04',
    cumulative_excursion_minutes: 0,
    peak_recorded_temp_c: 5.6,
    max_threshold_breach_c: 0.0,
    disposition: 'RELEASE_APPROVED',
  },
  {
    batch_lot_id: 'LOT-DRY-2026D',
    product_category: 'PERISHABLE_DAIRY',
    shipment_id: 'SHP-9004',
    carrier: 'FreshHaul',
    transit_lane: 'PUN -> BOM',
    destination_hub: 'HUB-BOM-RETAIL09',
    cumulative_excursion_minutes: 0,
    peak_recorded_temp_c: 2.8,
    max_threshold_breach_c: 0.0,
    disposition: 'RELEASE_APPROVED',
  },
];

const DELTA_HISTORY = [
  { version: 2, operation: 'OPTIMIZE', metrics: 'Compacted 6 small Parquet files -> 1 Zstd file', ts: '2026-11-25 09:15:10 UTC' },
  { version: 1, operation: 'MERGE', metrics: 'Upserted 20 late-arriving packets; deduplicated 20 retransmissions', ts: '2026-11-25 09:14:42 UTC' },
  { version: 0, operation: 'CREATE TABLE AS SELECT', metrics: 'Initialized main.coldchain_shield.silver_thermal_excursions (CDF=true)', ts: '2026-11-25 09:10:05 UTC' },
];

export default function App() {
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [quarantineThresholdMins, setQuarantineThresholdMins] = useState(180);

  const evaluatedBatches = useMemo(() => {
    return BATCH_WATCHLIST.map((b) => {
      let dynamicDisposition = 'RELEASE_APPROVED';
      if (b.cumulative_excursion_minutes >= quarantineThresholdMins || b.max_threshold_breach_c >= 5.0) {
        dynamicDisposition = 'QUARANTINE_IMMEDIATE';
      } else if (b.cumulative_excursion_minutes >= 45 || b.max_threshold_breach_c >= 2.0) {
        dynamicDisposition = 'QA_HOLD_INSPECT';
      }
      return { ...b, dynamicDisposition };
    }).filter((b) => filterStatus === 'ALL' || b.dynamicDisposition === filterStatus);
  }, [filterStatus, quarantineThresholdMins]);

  const quarantineCount = evaluatedBatches.filter((b) => b.dynamicDisposition === 'QUARANTINE_IMMEDIATE').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <ThermometerSnowflake className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight">ColdChainShield</h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-300 border border-orange-500/30 font-medium">
                  Databricks + Delta Lake
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Real-Time Vaccine & Biologics Thermal Excursion Detection • ACID MERGE • Batch Recall Traceability
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Immediate Quarantine Lots</span>
              <AlertOctagon className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-rose-400">{quarantineCount} Batches</div>
            <div className="mt-1 text-xs text-slate-400">Blocked prior to clinic distribution</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Delta MERGE Deduplication</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">100% Idempotent</div>
            <div className="mt-1 text-xs text-slate-400">Late logger retransmissions merged cleanly</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Quarantine Threshold</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-300">{quarantineThresholdMins} mins</div>
            <div className="mt-1 text-xs text-slate-400">Adjustable cumulative excursion rule</div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Delta Change Data Feed</span>
              <History className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-cyan-300">Enabled (v2)</div>
            <div className="mt-1 text-xs text-slate-400">Full FDA/QA time-travel audit trail</div>
          </div>
        </div>

        {/* Rule Simulator & Filter */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Simulate Quarantine Exposure Cutoff: <span className="text-amber-300">{quarantineThresholdMins} minutes</span>
            </label>
            <input
              type="range"
              min="30"
              max="240"
              step="15"
              value={quarantineThresholdMins}
              onChange={(e) => setQuarantineThresholdMins(Number(e.target.value))}
              className="w-64 accent-cyan-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {['ALL', 'QUARANTINE_IMMEDIATE', 'QA_HOLD_INSPECT', 'RELEASE_APPROVED'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-xl border font-medium ${
                  filterStatus === st
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Gold Batch Recall Watchlist Table */}
        <div className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Truck className="w-4 h-4 text-cyan-400" />
              Gold Batch Quarantine & Recall Watchlist (`main.coldchain_shield.gold_batch_recall_watch`)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400">
                  <th className="py-3 px-4">Batch Lot ID</th>
                  <th className="py-3 px-4">Product Category</th>
                  <th className="py-3 px-4">Carrier & Lane</th>
                  <th className="py-3 px-4">Destination Hub</th>
                  <th className="py-3 px-4">Excursion Mins</th>
                  <th className="py-3 px-4">Peak Temp</th>
                  <th className="py-3 px-4">Max Breach</th>
                  <th className="py-3 px-4">Disposition</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {evaluatedBatches.map((b) => (
                  <tr key={b.batch_lot_id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-100">{b.batch_lot_id}</td>
                    <td className="py-3 px-4 text-slate-300">{b.product_category}</td>
                    <td className="py-3 px-4 text-slate-300">
                      {b.carrier} <span className="text-slate-500">({b.transit_lane})</span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-300">{b.destination_hub}</td>
                    <td className="py-3 px-4 font-semibold text-amber-300">{b.cumulative_excursion_minutes} min</td>
                    <td className="py-3 px-4 font-mono">{b.peak_recorded_temp_c}°C</td>
                    <td className="py-3 px-4 font-mono text-rose-300">+{b.max_threshold_breach_c}°C</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          b.dynamicDisposition === 'QUARANTINE_IMMEDIATE'
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : b.dynamicDisposition === 'QA_HOLD_INSPECT'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {b.dynamicDisposition}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Delta Lake Audit Log */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            Delta Lake Transaction Log (`DESCRIBE HISTORY main.coldchain_shield.silver_thermal_excursions`)
          </h3>
          <div className="space-y-2 text-xs">
            {DELTA_HISTORY.map((h) => (
              <div
                key={h.version}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono font-semibold">
                    v{h.version}
                  </span>
                  <span className="font-mono font-semibold text-slate-200">{h.operation}</span>
                  <span className="text-slate-400">{h.metrics}</span>
                </div>
                <span className="font-mono text-slate-500">{h.ts}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
