"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { NewPositionInput, PositionWithPnl } from "@/lib/types";
import { formatSignedPct, formatUsd } from "@/lib/format";
import { PositionForm } from "./position-form";
import { PositionsTable } from "./positions-table";
import { EquityCurve, computeEquityCurve } from "./equity-curve";

export function PositionsTracker() {
  const searchParams = useSearchParams();
  const [positions, setPositions] = useState<PositionWithPnl[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/positions");
      if (!res.ok) throw new Error("Failed to load positions.");
      const data = await res.json();
      setPositions(data.positions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load positions.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/positions");
        if (!res.ok) throw new Error("Failed to load positions.");
        const data = await res.json();
        if (cancelled) return;
        setPositions(data.positions);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load positions.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(input: NewPositionInput) {
    const res = await fetch("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Failed to add position.");
    }
    await refresh();
  }

  async function handleUpdate(id: number, update: { exitPrice?: number; exitDate?: string; notes?: string | null }) {
    const res = await fetch(`/api/positions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    });
    if (!res.ok) return;
    await refresh();
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/positions/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    await refresh();
  }

  if (error && positions === null) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="text-sm text-loss">{error}</p>
      </div>
    );
  }

  if (positions === null) {
    return <p className="text-sm text-ink-dim">Loading…</p>;
  }

  const closed = positions.filter((p) => p.status === "closed");
  const open = positions.filter((p) => p.status === "open");
  const realizedTotal = closed.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const unrealizedTotal = open.reduce((sum, p) => sum + (p.pnl ?? 0), 0);
  const winRate = closed.length > 0 ? (closed.filter((p) => (p.pnl ?? 0) > 0).length / closed.length) * 100 : null;
  const equityPoints = computeEquityCurve(closed);

  const prefill = searchParams.get("ticker")
    ? {
        ticker: searchParams.get("ticker") ?? "",
        entryPrice: Number(searchParams.get("entryPrice")) || undefined,
        aiTarget: searchParams.get("aiTarget") ? Number(searchParams.get("aiTarget")) : null,
        thesis: searchParams.get("thesis"),
      }
    : undefined;

  return (
    <div className="flex animate-fade-in flex-col gap-8">
      <PositionForm prefill={prefill} onSubmit={handleAdd} />

      <div className="flex flex-wrap gap-8 border border-line bg-panel p-5">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">Realized P&amp;L</p>
          <p className={`mt-1 font-mono text-lg tabular-nums ${realizedTotal >= 0 ? "text-accent" : "text-loss"}`}>
            {formatUsd(realizedTotal)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">Unrealized P&amp;L</p>
          <p className={`mt-1 font-mono text-lg tabular-nums ${unrealizedTotal >= 0 ? "text-accent" : "text-loss"}`}>
            {formatUsd(unrealizedTotal)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">Win rate</p>
          <p className="mt-1 font-mono text-lg tabular-nums text-ink">
            {winRate !== null ? formatSignedPct(winRate).replace("+", "") : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-ink-faint">Open positions</p>
          <p className="mt-1 font-mono text-lg tabular-nums text-ink">{open.length}</p>
        </div>
      </div>

      <EquityCurve points={equityPoints} />

      <PositionsTable positions={positions} onUpdate={handleUpdate} onDelete={handleDelete} />
    </div>
  );
}
