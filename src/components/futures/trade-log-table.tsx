"use client";

import type { TradeLogEntry } from "@/lib/trade-log";
import { formatSignedNumber } from "@/lib/format";

const th = "p-3 text-[11px] font-normal uppercase tracking-wider text-ink-faint";
const td = "p-3 align-middle";

function TradeLogStats({ entries }: { entries: TradeLogEntry[] }) {
  const withRr = entries.filter((e): e is TradeLogEntry & { rr: number } => e.rr !== null);
  const totalRr = withRr.reduce((sum, e) => sum + e.rr, 0);
  const avgRr = withRr.length > 0 ? totalRr / withRr.length : null;
  const winRate = withRr.length > 0 ? (withRr.filter((e) => e.rr > 0).length / withRr.length) * 100 : null;

  const stats = [
    { label: "Trades", value: String(entries.length) },
    { label: "Total RR", value: withRr.length > 0 ? `${formatSignedNumber(totalRr)}R` : "—" },
    { label: "Avg RR", value: avgRr !== null ? `${formatSignedNumber(avgRr)}R` : "—" },
    { label: "Win Rate", value: winRate !== null ? `${winRate.toFixed(0)}%` : "—" },
  ];

  return (
    <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-panel p-4">
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">{s.label}</p>
          <p className="mt-1 font-mono text-2xl tabular-nums text-ink">{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function ChartThumbnail({ src, label }: { src: string | null; label: string }) {
  if (!src) return <span className="text-xs text-ink-faint">—</span>;
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" title={`Open ${label} full-size`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic base64 data URLs, not a static asset next/image can optimize */}
      <img src={src} alt={label} className="h-12 w-20 border border-line object-cover transition-opacity duration-300 hover:opacity-80" />
    </a>
  );
}

export function TradeLogTable({
  entries,
  onDelete,
}: {
  entries: TradeLogEntry[];
  onDelete: (id: number) => Promise<void>;
}) {
  if (entries.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="text-sm text-ink-dim">No trade log entries yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <TradeLogStats entries={entries} />
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className={th}>Date</th>
              <th className={th}>AI Analysis</th>
              <th className={th}>CVD</th>
              <th className={th}>RR</th>
              <th className={th}>5m/15m Chart</th>
              <th className={th}>1m Chart</th>
              <th className={th}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-line">
                <td className={`${td} font-mono tabular-nums text-ink-dim`}>{entry.entryDate}</td>
                <td className={`${td} font-mono tabular-nums text-ink`}>{entry.aiAnalysis ?? "—"}</td>
                <td className={`${td} font-mono tabular-nums text-ink-dim`}>{entry.cvd ?? "—"}</td>
                <td
                  className={`${td} font-mono tabular-nums ${
                    entry.rr === null ? "text-ink-faint" : entry.rr >= 0 ? "text-accent" : "text-loss"
                  }`}
                >
                  {entry.rr !== null ? `${formatSignedNumber(entry.rr)}R` : "—"}
                </td>
                <td className={td}>
                  <ChartThumbnail src={entry.chart5m15m} label="5m/15m chart" />
                </td>
                <td className={td}>
                  <ChartThumbnail src={entry.chart1m} label="1m chart" />
                </td>
                <td className={`${td} text-right`}>
                  <button
                    type="button"
                    onClick={() => onDelete(entry.id)}
                    className="text-[11px] uppercase tracking-wider text-ink-faint transition-colors duration-300 hover:text-loss"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
