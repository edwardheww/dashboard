"use client";

import { useState } from "react";
import type { NewPositionInput } from "@/lib/types";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const inputClass =
  "w-full border border-line bg-void px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none";
const labelClass = "text-[11px] uppercase tracking-wider text-ink-faint";

export function PositionForm({
  prefill,
  onSubmit,
}: {
  prefill?: Partial<NewPositionInput>;
  onSubmit: (input: NewPositionInput) => Promise<void>;
}) {
  const [ticker, setTicker] = useState(prefill?.ticker ?? "");
  const [shares, setShares] = useState("");
  const [entryPrice, setEntryPrice] = useState(prefill?.entryPrice ? String(prefill.entryPrice) : "");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sharesNum = Number(shares);
    const priceNum = Number(entryPrice);

    if (!ticker.trim()) return setError("Ticker is required.");
    if (!Number.isFinite(sharesNum) || sharesNum <= 0) return setError("Shares must be a positive number.");
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setError("Entry price must be a positive number.");
    if (!entryDate) return setError("Entry date is required.");

    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        ticker: ticker.trim().toUpperCase(),
        shares: sharesNum,
        entryPrice: priceNum,
        entryDate,
        aiTarget: prefill?.aiTarget ?? null,
        thesis: prefill?.thesis ?? null,
        notes: notes.trim() || null,
      });
      setTicker("");
      setShares("");
      setEntryPrice("");
      setEntryDate(todayIso());
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add position.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-line bg-panel p-5">
      {prefill?.thesis && (
        <p className="mb-4 text-sm text-ink-dim">
          Logging from screener pick: <span className="text-ink">{prefill.thesis}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div>
          <label className={labelClass} htmlFor="pos-ticker">Ticker</label>
          <input
            id="pos-ticker"
            className={`${inputClass} mt-2 uppercase`}
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="NVDA"
            spellCheck={false}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="pos-shares">Shares</label>
          <input
            id="pos-shares"
            type="number"
            step="any"
            min="0"
            className={`${inputClass} mt-2`}
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="10"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="pos-entry-price">Entry price</label>
          <input
            id="pos-entry-price"
            type="number"
            step="0.01"
            min="0"
            className={`${inputClass} mt-2`}
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            placeholder="121.79"
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="pos-entry-date">Entry date</label>
          <input
            id="pos-entry-date"
            type="date"
            className={`${inputClass} mt-2`}
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="pos-notes">Notes (optional)</label>
          <input
            id="pos-notes"
            className={`${inputClass} mt-2`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder=""
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4">
        <button
          type="submit"
          disabled={submitting}
          className="h-[38px] bg-accent px-5 text-sm font-medium uppercase tracking-wider text-void transition-[opacity,transform] duration-300 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {submitting ? "Adding…" : "Add position"}
        </button>
        {error && (
          <span className="text-sm text-loss" role="alert">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
