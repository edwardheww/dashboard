"use client";

import { useEffect, useState } from "react";
import type { NewTradeLogEntryInput, TradeLogEntry } from "@/lib/trade-log";
import { TradeLogForm } from "./trade-log-form";
import { TradeLogTable } from "./trade-log-table";

export function TradeLogView() {
  const [entries, setEntries] = useState<TradeLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  async function refresh() {
    try {
      const res = await fetch("/api/trade-log");
      if (!res.ok) throw new Error("Failed to load trade log.");
      const data = await res.json();
      setEntries(data.entries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trade log.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/trade-log");
        if (!res.ok) throw new Error("Failed to load trade log.");
        const data = await res.json();
        if (cancelled) return;
        setEntries(data.entries);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load trade log.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(input: NewTradeLogEntryInput) {
    const res = await fetch("/api/trade-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error ?? "Failed to add trade log entry.");
    }
    await refresh();
    setFormOpen(false);
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/trade-log/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    await refresh();
  }

  if (error && entries === null) {
    return (
      <div className="border border-line p-8 text-center">
        <p className="text-sm text-loss">{error}</p>
      </div>
    );
  }

  if (entries === null) {
    return <p className="text-sm text-ink-dim">Loading…</p>;
  }

  return (
    <div className="flex animate-fade-in flex-col gap-8">
      {formOpen ? (
        <div key="form" className="animate-reveal">
          <TradeLogForm onSubmit={handleAdd} onCancel={() => setFormOpen(false)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="h-[38px] w-fit bg-accent px-5 text-sm font-medium uppercase tracking-wider text-void transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98]"
        >
          Add entry
        </button>
      )}
      <TradeLogTable entries={entries} onDelete={handleDelete} />
    </div>
  );
}
