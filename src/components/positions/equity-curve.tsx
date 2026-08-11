"use client";

import { useId, useState } from "react";
import { formatUsd } from "@/lib/format";

export type EquityPoint = {
  date: string;
  cumulative: number;
};

const WIDTH = 800;
const HEIGHT = 220;
const PAD = { top: 28, right: 16, bottom: 28, left: 16 };

export function EquityCurve({ points }: { points: EquityPoint[] }) {
  const clipId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="text-sm text-ink-dim">
          Cumulative realized P&amp;L will chart here once you close a position.
        </p>
      </div>
    );
  }

  const values = points.map((p) => p.cumulative);
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const yRange = maxY - minY || 1;

  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - minY) / yRange) * plotH;
  const zeroY = y(0);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)},${y(p.cumulative)}`).join(" ");
  const areaPath = `${linePath} L ${x(points.length - 1)},${zeroY} L ${x(0)},${zeroY} Z`;

  const last = points[points.length - 1];
  const lastPositive = last.cumulative >= 0;

  return (
    <div className="relative border border-line p-4">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-ink-faint">Cumulative realized P&amp;L</p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Cumulative realized profit and loss over time">
        <defs>
          <clipPath id={`${clipId}-above`}>
            <rect x={0} y={0} width={WIDTH} height={zeroY} />
          </clipPath>
          <clipPath id={`${clipId}-below`}>
            <rect x={0} y={zeroY} width={WIDTH} height={HEIGHT - zeroY} />
          </clipPath>
        </defs>

        <path d={areaPath} fill="var(--accent)" fillOpacity={0.1} clipPath={`url(#${clipId}-above)`} />
        <path d={areaPath} fill="var(--loss)" fillOpacity={0.1} clipPath={`url(#${clipId}-below)`} />

        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={zeroY} y2={zeroY} stroke="var(--line)" strokeWidth={1} />

        <path d={linePath} fill="none" stroke="var(--ink-dim)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {hovered !== null && (
          <line
            x1={x(hovered)}
            x2={x(hovered)}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            stroke="var(--ink-faint)"
            strokeWidth={1}
          />
        )}

        <circle
          cx={x(points.length - 1)}
          cy={y(last.cumulative)}
          r={5}
          fill={lastPositive ? "var(--accent)" : "var(--loss)"}
          stroke="var(--panel)"
          strokeWidth={2}
        />
        <text
          x={x(points.length - 1)}
          y={y(last.cumulative) - 12}
          textAnchor="end"
          className="font-mono text-[11px] tabular-nums"
          fill="var(--ink)"
        >
          {formatUsd(last.cumulative)}
        </text>

        <text x={PAD.left} y={HEIGHT - 8} textAnchor="start" className="font-mono text-[10px]" fill="var(--ink-faint)">
          {points[0].date}
        </text>
        <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" className="font-mono text-[10px]" fill="var(--ink-faint)">
          {last.date}
        </text>

        {points.map((p, i) => (
          <circle
            key={p.date + i}
            cx={x(i)}
            cy={y(p.cumulative)}
            r={12}
            fill="transparent"
            tabIndex={0}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
          />
        ))}
      </svg>

      {hovered !== null && (
        <div
          className="pointer-events-none absolute animate-fade-in border border-line bg-panel px-3 py-2 text-xs"
          style={{
            left: `${(x(hovered) / WIDTH) * 100}%`,
            top: `${(y(points[hovered].cumulative) / HEIGHT) * 100}%`,
            transform: "translate(-50%, -120%)",
          }}
        >
          <p className="font-mono text-ink-faint">{points[hovered].date}</p>
          <p className={`font-mono tabular-nums ${points[hovered].cumulative >= 0 ? "text-accent" : "text-loss"}`}>
            {formatUsd(points[hovered].cumulative)}
          </p>
        </div>
      )}
    </div>
  );
}

export function computeEquityCurve(closed: Array<{ exitDate: string | null; pnl: number | null }>): EquityPoint[] {
  const sorted = closed
    .filter((p): p is { exitDate: string; pnl: number } => p.exitDate !== null && p.pnl !== null)
    .sort((a, b) => a.exitDate.localeCompare(b.exitDate));

  let running = 0;
  return sorted.map((p) => {
    running += p.pnl;
    return { date: p.exitDate, cumulative: running };
  });
}
